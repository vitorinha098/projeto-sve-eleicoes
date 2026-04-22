const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path"); // ESSENCIAL PARA AS IMAGENS
const bcrypt = require("bcrypt"); // importar os hashs das passes

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configuração para servir as imagens da pasta 'img'
app.use(express.static(path.join(__dirname, "img")));

// Ligar ao MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "base_de_dados_pi",
});

db.connect((err) => {
  if (err) throw err;
  console.log("Conectado ao MySQL com sucesso!");
});

// --- NOVA ROTA PARA VOTAR (Compatível com a BD do colega) ---
app.post("/votar", (req, res) => {
  const { idEleitor, id_candidato, id_eleicao } = req.body;

  // 1. Verificação corrigida
  if (!idEleitor || !id_candidato) {
    return res
      .status(400)
      .json({ success: false, message: "Dados de voto incompletos!" });
  }

  // 2. QUERY CORRIGIDA: Mudámos 'NIF' para 'id_eleitor' e adicionámos 'data_voto'
  const sqlParticipacao =
    "INSERT INTO participacao (id_eleicao, id_eleitor, data_voto) VALUES (?, ?, NOW())";

  db.query(sqlParticipacao, [id_eleicao || 1, idEleitor], (err) => {
    if (err) {
      console.error("Erro Participação:", err.sqlMessage);
      // Aqui enviamos o erro real para o teu alert no browser
      return res.status(500).json({
        success: false,
        message: "Erro na Tabela Participacao: " + err.sqlMessage,
      });
    }

    // 3. Registar o voto na tabela voto
    const sqlVoto = "INSERT INTO voto (id_candidato, id_eleicao) VALUES (?, ?)";
    db.query(sqlVoto, [id_candidato, id_eleicao || 1], (err) => {
      if (err) {
        console.error("Erro Voto:", err);
        return res
          .status(500)
          .json({ success: false, message: "Erro técnico ao gravar o voto." });
      }
      res.json({ success: true });
    });
  });
});

// -- Rota de Reset password
app.post("/reset_password", async (req, res) => {
  const { nif, validade_cc, nova_passe } = req.body;

  try {
    const mudanca_passe =
      "Update eleitor set palavra_passe = ? where NIF = ? and data_validade_cc = ?";
    const Password_hashed = await bcrypt.hash(nova_passe, 10);

    db.query(
      mudanca_passe,
      [Password_hashed, nif, validade_cc],
      (err, result) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: err.sqlMessage,
          });
        }

        if (result.affectedRows > 0) {
          res.json({ success: true, message: "Palavra-passe alterada!" });
        } else {
          res.status(401).json({
            success: false,
            message:
              "Não foi possivel encontrar nenhum utilizador com os esses dados de acesso.",
          });
        }
      },
    );
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro ao processar." });
  }
});

// --- ROTA DE LOGIN ---
app.post("/login", (req, res) => {
  const { nif, password } = req.body;

  const sql =
    "SELECT id_eleitor, nome_completo, palavra_passe FROM eleitor WHERE NIF = ?";

  db.query(sql, [nif], async (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length > 0) {
      const eleitor = results[0];

      // encripta a password dada e compara com a da conta criada
      const comparar_hashes = await bcrypt.compare(
        password,
        eleitor.palavra_passe,
      );

      if (comparar_hashes) {
        res.json({
          success: true,
          nome: eleitor.nome_completo,
          idEleitor: eleitor.id_eleitor,
        });
      } else {
        res
          .status(401)
          .json({ success: false, message: "Palavra-passe incorreta!" });
      }
    } else {
      res.status(401).json({ success: false, message: "NIF não encontrado!" });
    }
  });
});

// --- ROTA DE REGISTO ---
// variavel password_hashed baralha a password
app.post("/registar", async (req, res) => {
  const { nome, data_nasc, genero, email, nif, validade_cc, password } =
    req.body;

  try {
    const Password_hashed = await bcrypt.hash(password, 10);

    // colunas aonde inserir
    const sql = `INSERT INTO eleitor (nome_completo, data_nascimento, genero, email, NIF, data_validade_cc, palavra_passe) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    // pede-se para inserir a password_hashed em vez a password normal
    db.query(
      sql,
      [nome, data_nasc, genero, email, nif, validade_cc, Password_hashed],
      (err, result) => {
        if (err) {
          return res.status(400).json({
            success: false,
            message: err.sqlMessage || "Erro ao registar.",
          });
        }

        res.json({ success: true });
      },
    );
  } catch (erroHash) {
    res.status(500).json({
      success: false,
      message: "Erro de segurança ao encriptar password.",
    });
  }
});

// --- LISTAR CANDIDATOS ---
app.get("/candidatos", (req, res) => {
  const sql = `
        SELECT c.id_candidato, c.nome_completo, p.nome AS nome_partido, p.foto 
        FROM candidato c
        JOIN partido p ON c.id_partido = p.id_partido
        WHERE c.id_eleicao = 1`;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

app.get("/verificar-voto/:nif", (req, res) => {
  const nif = req.params.nif;
  // Procuramos na tabela participacao pelo id_eleitor associado a este NIF
  const sql =
    "SELECT * FROM participacao WHERE id_eleitor = (SELECT id_eleitor FROM eleitor WHERE nif = ?)";
  db.query(sql, [nif], (err, results) => {
    if (err) return res.json({ ja_votou: false });
    res.json({ ja_votou: results.length > 0 });
  });
});

app.get("/resultados", (req, res) => {
  // Simplificamos: tiramos o JOIN com 'partido' porque a tabela não existe
  const sql = `
        SELECT 
            c.nome_completo, 
            c.id_partido, 
            COUNT(v.id_voto) AS total_votos 
        FROM candidato c
        LEFT JOIN voto v ON c.id_candidato = v.id_candidato
        GROUP BY c.id_candidato, c.nome_completo, c.id_partido
        ORDER BY total_votos DESC
    `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro SQL nos resultados:", err.sqlMessage);
      return res.status(500).json({ success: false, message: err.sqlMessage });
    }
    res.json(results);
  });
});

app.listen(8000, () =>
  console.log("Servidor a correr em http://localhost:8000"),
);

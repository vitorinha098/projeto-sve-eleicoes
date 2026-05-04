const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Servir imagens da pasta 'img'
app.use(express.static(path.join(__dirname, "img")));

// Configuração da Ligação Aiven Cloud
const db = mysql.createConnection({
  host: "mysql-votacao-vitoria-51c4.e.aivencloud.com",
  port: 11331,
  user: "avnadmin",
  password: process.env.DB_PASSWORD,
  database: "defaultdb",
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
  if (err) {
    console.error("Erro ao ligar à base de dados:", err.message);
    return;
  }
  console.log("SUCESSO: Conectado ao MySQL na Cloud!");
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
        res.status(401).json({ success: false, message: "Palavra-passe incorreta!" });
      }
    } else { res.status(401).json({ success: false, message: "NIF não encontrado!" }); }
  });
});

// --- LISTAR CANDIDATOS ---
app.get("/candidatos", (req, res) => {
  const sql = `
    SELECT c.id_candidato, c.nome_completo, p.nome AS nome_partido, p.foto 
    FROM Candidato c
    JOIN Partido p ON c.id_partido = p.id_partido
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

// Rota para obter os resultados da eleição
app.get("/resultados", (req, res) => {
  // Esta query soma os votos reais da tabela Voto e junta os nomes dos candidatos e partidos
  const sql = `
    SELECT 
      c.nome_completo AS nome_completo, 
      p.nome AS nome_partido, 
      COUNT(v.id_voto) AS total_votos
    FROM Candidato c
    LEFT JOIN Voto v ON c.id_candidato = v.id_candidato
    INNER JOIN Partido p ON c.id_partido = p.id_partido
    GROUP BY c.id_candidato, c.nome_completo, p.nome
    ORDER BY total_votos DESC;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro SQL nos resultados:", err.sqlMessage);
      return res.status(500).json({ success: false, message: err.sqlMessage });
    }
    res.json(results); // Envia os dados para o front-end
  });
});

app.listen(8000, () =>
  console.log("Servidor a correr em http://localhost:8000"),
);

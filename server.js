require("dotenv").config();

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
    rejectUnauthorized: false,
  },
});

db.connect((err) => {
  if (err) {
    console.error("Erro ao ligar à base de dados:", err.message);
    return;
  }
  console.log("SUCESSO: Conectado ao MySQL na Cloud!");
});

// --- ROTA DE REGISTO ---
app.post("/registar", async (req, res) => {
  const { nome, data_nasc, genero, email, nif, validade_cc, password } =
    req.body;
  try {
    const Password_hashed = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO Eleitor (nome_completo, data_nascimento, genero, email, NIF, data_validade_cc, palavra_passe) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.query(
      sql,
      [nome, data_nasc, genero, email, nif, validade_cc, Password_hashed],
      (err) => {
        if (err)
          return res
            .status(400)
            .json({ success: false, message: err.sqlMessage });
        res.json({ success: true });
      },
    );
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// --- ROTA DE LOGIN ---
app.post("/login", (req, res) => {
  const { nif, password } = req.body;
  const sql =
    "SELECT id_eleitor, nome_completo, palavra_passe FROM Eleitor WHERE NIF = ?";
  db.query(sql, [nif], async (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length > 0) {
      const eleitor = results[0];
      const match = await bcrypt.compare(password, eleitor.palavra_passe);
      if (match) {
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

// --- PROCESSAR VOTO ---
app.post("/votar", (req, res) => {
  const { idEleitor, id_candidato, id_eleicao } = req.body;

  const sqlParticipacao =
    "INSERT INTO Participacao (id_eleicao, id_eleitor, data_voto) VALUES (?, ?, NOW())";

  const sql =
    "INSERT INTO Voto (id_eleitor, id_candidato, id_eleicao) VALUES (?, ?, ?)";

  db.query(sqlParticipacao, [id_eleicao || 1, idEleitor], (err) => {
    if (err) {
      console.error("Erro na base de dados:", err.code);
      if (err.code === "ER_DUP_ENTRY") {
        // Manter status 200 ou usar 400, mas garantir que o JSON é enviado
        return res.status(400).json({
          success: false,
          message: "Já votou nesta eleição!",
          code: 1062,
        });
      }
      return res.status(500).json({ success: false, message: err.sqlMessage });
    }

    // Agora o sqlVoto já existe e não vai dar erro
    db.query(sqlVoto, [id_candidato, id_eleicao || 1], (votoErr) => {
      if (votoErr) {
        console.error("Erro no Voto:", votoErr.sqlMessage);
        return res
          .status(500)
          .json({ success: false, message: "Erro ao gravar o voto." });
      }
      res.json({ success: true });
    });
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
      console.error("Erro ao procurar resultados:", err.sqlMessage);
      return res
        .status(500)
        .json({ success: false, message: "Erro na base de dados." });
    }
    res.json(results); // Envia os dados para o front-end
  });
});

app.listen(8000, () => console.log("Servidor em http://localhost:8000"));

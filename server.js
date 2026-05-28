require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/img", express.static(path.join(__dirname, "public/assets/img")));

// Configuração do Multer (onde ele guarda os novos envios)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public/assets/img"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

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

// rota para votar
app.post("/votar", (req, res) => {
  const { idEleitor, id_candidato, id_eleicao } = req.body;

  if (!idEleitor || !id_candidato) {
    return res
      .status(400)
      .json({ success: false, message: "Dados de voto incompletos!" });
  }

  const sqlParticipacao =
    "INSERT INTO Participacao (id_eleicao, id_eleitor, data_voto) VALUES (?, ?, NOW())";

  db.query(sqlParticipacao, [id_eleicao || 1, idEleitor], (err) => {
    if (err) {
      console.error("Erro Participação:", err.sqlMessage);
      return res.status(500).json({
        success: false,
        message: "Erro na Tabela Participacao: " + err.sqlMessage,
      });
    }

    // 3. Registar o voto na tabela voto
    const sqlVoto = "INSERT INTO Voto (id_candidato, id_eleicao) VALUES (?, ?)";
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

// rota registrar eleitor
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

// rota registrar administrador
app.post("/registar_administrador", async (req, res) => {
  const { nome, data_nasc, email, password } = req.body;
  try {
    const Password_hashed = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO Administrador (nome, data_nascimento, email, palavra_passe) VALUES (?, ?, ?, ?)`;
    db.query(sql, [nome, data_nasc, email, Password_hashed], (err) => {
      if (err)
        return res
          .status(400)
          .json({ success: false, message: err.sqlMessage });
      res.json({ success: true });
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// rota para criar candidato
app.post("/criar-candidato", upload.fields([
    { name: 'foto_candidato', maxCount: 1 },
    { name: 'logo_partido', maxCount: 1 }
]), (req, res) => {
    // Agora o nome_partido vem do formulário!
    const { nome_completo, genero, data_nascimento, descricao, nome_partido } = req.body;

    const fotoCandNome = req.files['foto_candidato'] ? req.files['foto_candidato'][0].filename : 'default.png';
    const logoPartNome = req.files['logo_partido'] ? req.files['logo_partido'][0].filename : 'default_logo.png';

    // Inserir o partido com o nome real que o admin escreveu
    const sqlPart = "INSERT INTO Partido (nome, foto) VALUES (?, ?)";
    db.query(sqlPart, [nome_partido, logoPartNome], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.sqlMessage });

        const partidoId = result.insertId;

        // Inserir o candidato ligado a esse partido
        const sqlCand = `INSERT INTO Candidato 
            (nome_completo, genero, data_nascimento, foto, descricao, id_partido, id_eleicao) 
            VALUES (?, ?, ?, ?, ?, ?, 1)`;

        db.query(sqlCand, [nome_completo, genero, data_nascimento, fotoCandNome, descricao, partidoId], (err) => {
            if (err) return res.status(500).json({ success: false, message: err.sqlMessage });
            res.json({ success: true, message: "Candidato e Partido criados!" });
        });
    });
});

// Rota para listar partidos no formulário
app.get("/partidos", (req, res) => {
    db.query("SELECT id_partido, nome FROM Partido", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Rota de Reset password
app.post("/reset_password", async (req, res) => {
  const { nif, validade_cc, nova_passe } = req.body;

  try {
    const mudanca_passe =
      "Update Eleitor set palavra_passe = ? where NIF = ? and data_validade_cc = ?";
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

// Rota de Reset password administrador
app.post("/reset_password_administrador", async (req, res) => {
  const { email, nova_passe } = req.body;

  try {
    const mudanca_passe =
      "Update Administrador set palavra_passe = ? where email = ?";
    const Password_hashed = await bcrypt.hash(nova_passe, 10);

    db.query(mudanca_passe, [Password_hashed, email], (err, result) => {
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
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro ao processar." });
  }
});

// ROTA DE LOGIN
app.post("/login", (req, res) => {
  const { nif, password } = req.body;

  const sql =
    "SELECT id_eleitor, nome_completo, palavra_passe FROM Eleitor WHERE NIF = ?";

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
      res
        .status(401)
        .json({ success: false, message: "Email não encontrado!" });
    }
  });
});

// Rota de login administrador
app.post("/login_administrador", (req, res) => {
  const { email, password } = req.body;

  const sql =
    "SELECT id_administrador, nome, palavra_passe FROM Administrador WHERE email = ?";

  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length > 0) {
      const administrador = results[0];

      // encripta a password dada e compara com a da conta criada
      const comparar_hashes = await bcrypt.compare(
        password,
        administrador.palavra_passe,
      );

      if (comparar_hashes) {
        res.json({
          success: true,
          nome: administrador.nome,
          idAdministrador: administrador.id_administrador,
        });
      } else {
        res
          .status(401)
          .json({ success: false, message: "Palavra-passe incorreta!" });
      }
    } else {
      res
        .status(401)
        .json({ success: false, message: "Email não encontrado!" });
    }
  });
});

// LISTAR CANDIDATOS
app.get("/candidatos", (req, res) => {
  const sql = `
    SELECT 
      c.id_candidato, 
      c.nome_completo, 
      c.foto AS foto_candidato, 
      p.nome AS nome_partido 
    FROM Candidato c
    LEFT JOIN Partido p ON c.id_partido = p.id_partido
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
    "SELECT * FROM Participacao WHERE id_eleitor = (SELECT id_eleitor FROM Eleitor WHERE nif = ?)";
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
      c.foto AS foto_candidato, 
      p.foto AS logo_partido,
      COUNT(v.id_voto) AS total_votos
    FROM Candidato c
    LEFT JOIN Voto v ON c.id_candidato = v.id_candidato
    LEFT JOIN Partido p ON c.id_partido = p.id_partido
    GROUP BY c.id_candidato, c.nome_completo, p.nome, c.foto, p.foto
    ORDER BY total_votos DESC;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro SQL nos resultados:", err.sqlMessage);
      return res.status(500).json({ success: false, message: err.sqlMessage });
    }
    res.json(results); 
  });
});

app.get("/eleicao/atual", (req, res) => {
  res.json({
    nome: "Eleições Presidenciais SVE 2026",
    tipo: "Sufrágio Universal",
    descricao: "Eleição oficial e segura para a Presidência da República através do Sistema de Voto Eletrónico.",
    estado: "Ativa",
    data_inicio: "2026-05-01T08:00:00.000Z",
    data_fim: "2026-06-01T20:00:00.000Z"
  });
});

app.get("/stats", (req, res) => {
  const sqlEleitores = "SELECT COUNT(*) AS total FROM Eleitor";
  const sqlCandidatos = "SELECT COUNT(*) AS total FROM Candidato";
  const sqlVotos = "SELECT COUNT(*) AS total FROM Voto";

  db.query(sqlEleitores, (err, resE) => {
    if (err) return res.status(500).json(err);
    
    db.query(sqlCandidatos, (err, resC) => {
      if (err) return res.status(500).json(err);
      
      db.query(sqlVotos, (err, resV) => {
        if (err) return res.status(500).json(err);
        
        res.json({
          total_eleitores: resE[0].total,
          total_candidatos: resC[0].total,
          total_votos: resV[0].total
        });
      });
    });
  });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Servidor a rodar com sucesso na porta ${PORT}`);
});
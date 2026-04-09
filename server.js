const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 1. Ligar ao MySQL do XAMPP
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'projeto_votos'
});

db.connect(err => {
    if (err) throw err;
    console.log("Conectado ao MySQL!");

    // CÓDIGO PARA CRIAR A TABELA AUTOMATICAMENTE
    const sqlTable = `
    CREATE TABLE IF NOT EXISTS votos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nif VARCHAR(9) UNIQUE NOT NULL,
        escolha VARCHAR(100) NOT NULL
    )`;

    db.query(sqlTable, (err, result) => {
        if (err) throw err;
        console.log("Tabela 'votos' verificada/criada com sucesso!");
    });
});

// 2. Rota para VOTAR
app.post('/votar', (req, res) => {
    const { nif, escolha } = req.body;
    const sql = "INSERT INTO votos (nif, escolha) VALUES (?, ?)";
    
    db.query(sql, [nif, escolha], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).send({ message: "Já votou!" });
            }
            return res.status(500).send(err);
        }
        res.send({ status: "success" });
    });
});

// 3. Rota para ESTATÍSTICAS
app.get('/estatisticas', (req, res) => {
    const sql = "SELECT escolha, COUNT(*) as total FROM votos GROUP BY escolha";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).send(err);
        
        // Formatar para o gráfico
        let stats = { "Aliança Digital": 0, "União Verde": 0, "Frente Social": 0, "Voto em Branco": 0 };
        results.forEach(row => { stats[row.escolha] = row.total; });
        res.json(stats);
    });
});

// 4. Rota para VERIFICAR VOTO (para o teu novo login)
app.get('/verificar-voto/:nif', (req, res) => {
    const sql = "SELECT * FROM votos WHERE nif = ?";
    db.query(sql, [req.params.nif], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json({ ja_votou: results.length > 0 });
    });
});

// ROTA DE REGISTO (Cria o Eleitor)
app.post('/registar', (req, res) => {
    const { nome, nif, morada, nacionalidade, chave } = req.body;

    const sql = "INSERT INTO eleitores (nome_completo, nif, morada, nacionalidade, chave_acesso) VALUES (?, ?, ?, ?, ?)";
    
    db.query(sql, [nome, nif, morada, nacionalidade, chave], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: "Este NIF já está registado no sistema!" });
            }
            return res.status(500).json(err);
        }
        res.json({ success: true, message: "Eleitor registado com sucesso!" });
    });
});

// AJUSTE NA ROTA DE LOGIN (Verifica NIF + Chave)
app.post('/login', (req, res) => {
    const { nif, chave } = req.body;

    // O MySQL compara os dois. Se um estiver errado, não devolve linhas.
    const sql = "SELECT nome_completo FROM eleitores WHERE nif = ? AND chave_acesso = ?";
    
    db.query(sql, [nif, chave], (err, results) => {
        if (err) return res.status(500).json(err);

        if (results.length > 0) {
            // Sucesso! Devolvemos o nome para personalizar o boletim
            res.json({ success: true, nome: results[0].nome_completo });
        } else {
            // Se chegou aqui, ou o NIF não existe ou a CHAVE está errada
            res.status(401).json({ success: false, message: "NIF ou Chave de Acesso incorretos!" });
        }
    });
});

app.listen(8000, () => console.log("Servidor Node.js na porta 8000"));
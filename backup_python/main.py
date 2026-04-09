from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from projeto.backup_python.database import SessionLocal, VotoDB
from sqlalchemy import func

app = FastAPI()

# Permite a comunicação entre o HTML e o Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. CONFIGURAÇÃO DO EMAIL (Mantém o que já tinhas) ---
conf = ConnectionConfig(
    MAIL_USERNAME = "6361099b33ecde", # O teu User do Mailtrap
    MAIL_PASSWORD = "tua_password_aqui", # A tua Password do Mailtrap
    MAIL_FROM = "sistema@sve.pt",
    MAIL_PORT = 2525,
    MAIL_SERVER = "sandbox.smtp.mailtrap.io",
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True
)

# --- 2. BASE DE DADOS DE VOTOS (A novidade!) ---
votos_db = {
    "Aliança Digital": 0,
    "União Verde": 0,
    "Frente Social": 0,
    "Voto em Branco": 0
}

# --- 3. MODELOS DE DADOS (O que o Python espera receber) ---
class RecoveryRequest(BaseModel):
    nif: str
    email: EmailStr

class VoteRequest(BaseModel):
    nif: str
    escolha: str

# --- 4. ROTA DE RECUPERAÇÃO (A que já funciona!) ---
@app.post("/recuperar")
async def recuperar_chave(request: RecoveryRequest):
    html = f"<h2>SVE</h2><p>Nova chave para o NIF {request.nif}: <b>SVE-2026</b></p>"
    message = MessageSchema(
        subject="SVE - Recuperação",
        recipients=[request.email],
        body=html,
        subtype=MessageType.html
    )
    fm = FastMail(conf)
    await fm.send_message(message)
    return {"message": "Email enviado"}

# --- 5. ROTA DE VOTAÇÃO (A nova funcionalidade!) ---
@app.post("/votar")
async def registar_voto(request: VoteRequest):
    db = SessionLocal()
    try:
        # Verifica se este NIF já votou
        existe = db.query(VotoDB).filter(VotoDB.nif == request.nif).first()
        if existe:
            return {"status": "error", "message": "Este NIF já exerceu o direito de voto!"}

        # Cria o novo voto
        novo_voto = VotoDB(nif=request.nif, escolha=request.escolha)
        db.add(novo_voto)
        db.commit()
        print(f"VOTO GRAVADO NO DISCO: {request.escolha}")
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()

# --- 6. ROTA DE ESTATÍSTICAS (Para o gráfico!) ---
@app.get("/estatisticas")
async def obter_estatisticas():
    db = SessionLocal()
    # Inicializa o dicionário com zeros para garantir que todas as listas aparecem
    resultados = {"Aliança Digital": 0, "União Verde": 0, "Frente Social": 0, "Voto em Branco": 0}
    
    # Conta quantos votos existem para cada escolha
    contagem = db.query(VotoDB.escolha, func.count(VotoDB.id)).group_by(VotoDB.escolha).all()
    
    for escolha, total in contagem:
        resultados[escolha] = total
    
    db.close()
    return resultados

@app.get("/verificar-voto/{nif}")
async def verificar_voto(nif: str):
    db = SessionLocal()
    try:
        # Procura o NIF na tabela de votos
        voto = db.query(VotoDB).filter(VotoDB.nif == nif).first()
        if voto:
            return {"ja_votou": True}
        return {"ja_votou": False}
    finally:
        db.close()
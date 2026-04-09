from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. Criar o ficheiro da base de dados
URL_DATABASE = "mysql+pymysql://root:@localhost/projeto_votos"

engine = create_engine(URL_DATABASE)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. Definir a "Tabela" de Votos
class VotoDB(Base):
    __tablename__ = "votos"
    id = Column(Integer, primary_key=True, index=True)
    nif = Column(String, unique=True) # Um NIF só pode votar uma vez!
    escolha = Column(String)

# 3. Criar a tabela no ficheiro
Base.metadata.create_all(bind=engine)
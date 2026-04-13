    create database base_de_dados_pi;
    use base_de_dados_pi;

    delimiter $$
    create table Eleitor(
        id_eleitor bigint primary key auto_increment,
        nome_completo varchar(100) not null
            check (TRIM(nome_completo) <> ''),
        data_nascimento date,
        genero enum('Masculino','Feminino'),
        email varchar(100) unique
            check (email regexp '^[a-zA-Z0-9.]+@[a-zA-Z0-9.]+\\.[a-zA-Z]{2,}$'),
        -- perceber como funciona o hash
        palavra_passe varchar(255),
        NIF char(9) unique,
        data_validade_cc date not null,
        ultimo_login datetime
    );

    create table Administrador(
        id_administrador int primary key auto_increment,
        nome varchar(100) not null
            check (TRIM(nome) <> ''),
        data_nascimento date,
        email varchar(100) unique
            check (email regexp '^[a-zA-Z0-9.]+@[a-zA-Z0-9.]+\\.[a-zA-Z]{2,}$'),
        -- perceber como funciona o hash
        palavra_passe varchar(255)
    );

    create table Partido(
        id_partido tinyint primary key auto_increment,
        nome varchar(100) unique
            check (TRIM(nome) <> ''),
        foto varchar(100) not null
    );

    create table Eleicao(
        id_eleicao bigint primary key auto_increment,
        nome varchar(100) unique
            check (TRIM(nome) <> ''),
        descricao text,
        data_inicio date not null,
        data_fim date not null
            check (data_fim >= data_inicio),
        estado enum('Ativa', 'Encerrada'),
        tipo enum('Legislativa','Presidenciais','Personalizada'),
        id_administrador int,
        foreign key(id_administrador) references Administrador(id_administrador)
        on update restrict
        on delete set null
    );

    create table Candidato(
        id_candidato mediumint primary key auto_increment,
        nome_completo varchar(100) not null
            check (TRIM(nome_completo) <> ''),
        genero enum('Masculino','Feminino'),
        data_nascimento date,
        foto varchar(120),
        descricao text,
        id_partido tinyint,
        id_eleicao bigint,
        foreign key(id_partido) references Partido(id_partido)
        on delete set null
        on update restrict,
        foreign key(id_eleicao) references Eleicao(id_eleicao)
        on delete restrict
        on update restrict
    );

    create table Resultado(
        id_resultado bigint auto_increment,
        total_votos bigint
            check (total_votos >= 0),
        id_eleicao bigint,
        id_candidato mediumint,
        primary key(id_resultado,id_eleicao),
        foreign key(id_eleicao) references Eleicao(id_eleicao)
        on delete restrict
        on update restrict,
        foreign key(id_candidato) references Candidato(id_candidato)
        on delete cascade
        on update restrict
    );

    create table Participacao(
        data_voto datetime not null,
        id_eleicao bigint,
        id_eleitor bigint,
        primary key(id_eleicao,id_eleitor),
        foreign key(id_eleicao) references Eleicao(id_eleicao)
        on delete cascade
        on update restrict,
        foreign key(id_eleitor) references Eleitor(id_eleitor)
        on delete restrict
        on update restrict    
    );

    create table Voto (
        id_voto bigint auto_increment,
        id_candidato mediumint,
        id_eleicao bigint,
        primary key(id_voto, id_eleicao),
        foreign key(id_candidato) references Candidato(id_candidato)
        on delete cascade
        on update restrict,
        foreign key(id_eleicao) references Eleicao(id_eleicao)
        on delete cascade
        on update restrict
    );
    $$


-- trigger 1
delimiter $$
create trigger trigger_validade
before insert on Participacao
for each row 
begin
	declare datainicio date;
    declare datafim date;
    declare Estado enum('Ativa','Encerrada');
    declare cc_validade date;
    
    select data_inicio, data_fim, estado into datainicio, datafim, Estado
    from Eleicao
    where id_eleicao = new.id_eleicao;
    
    select data_validade_cc into cc_validade
    from Eleitor
    where id_eleitor = new.id_eleitor;
    
    if curdate() > datafim or curdate() < datainicio then
		signal sqlstate '45000'
        set message_text = 'Erro! Não pode votar na eleição fora da data estabelecida.';
	
    end if;
        
	if TRIM(Estado) = 'Encerrada' then
		signal sqlstate '45000'
        set message_text = "Erro! Esta eleição encontra-se fechada.";
	
    end if;
        
	if cc_validade < curdate() then
		signal sqlstate '45000'
        set message_text = 'Erro! O seu cartão de cidadão tem a validade expirada.';
	
    end if;
end$$
delimiter ;


-- trigger 2
delimiter $$
create trigger analise_credibilidade_voto
before insert on Voto
for each row
begin
	declare ideleicao bigint;
    
    select id_eleicao into ideleicao
    from candidato
    where id_candidato = new.id_candidato;
    
    if ideleicao != new.id_eleicao then
		signal sqlstate '45000'
        set message_text = 'Erro! Este candidato não pertence a esta eleição';

    end if;
end$$
delimiter ;


-- trigger 3
delimiter $$
create trigger maior_de_idade_eleitor
before insert on Eleitor
for each row
begin
	declare idade mediumint;
    
    set idade = Timestampdiff(year,new.data_nascimento,curdate());
    
    if idade < 18 then
		signal sqlstate '45000'
        set message_text = 'Erro! Não podes votar sendo menor de idade.';
        
	end if;
end$$
delimiter ; 


-- trigger 4
delimiter $$
create trigger maior_de_idade_candidato
before insert on Candidato
for each row
begin
	declare idade mediumint;
    
    set idade = Timestampdiff(year,new.data_nascimento,curdate());
    
    if idade < 18 then
		signal sqlstate '45000'
        set message_text = 'Erro! Não pode candidatar um menor de idade.';
        
	end if;
end$$
delimiter ; 


-- trigger 5
delimiter $$
create trigger contagem_votos
after insert on Voto
for each row
begin
	declare registro int;
    
    select count(*) into registro
    from Resultado
    where id_candidato = new.id_candidato and id_eleicao = new.id_eleicao;
    
    if registro = 0 then
		insert into Resultado (total_votos,id_eleicao,id_candidato)
        values (1, new.id_eleicao, new.id_candidato);
	
    end if;
    
    if registro > 0 then
		update Resultado
		set total_votos = total_votos + 1
		where id_candidato = new.id_candidato and id_eleicao = new.id_eleicao;
        
	end if;
    
end$$
delimiter ;
    
    
	
    
	
	

	
    
	
    
		
    
	

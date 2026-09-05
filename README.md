CÃ³digo-fonte das lives sobre [Laravel e React](https://www.youtube.com/watch?v=OsH8sZb8x1k&list=PLmY5AEiqDWwAKFymn4450k9XGLt8v3Xgd&index=1).<br>

## Requisitos

* PHP 8.2 ou superior;
* MySQL 8 ou superior;
* Composer;
* Node.js 20 ou superior;

## Como rodar o projeto baixado


curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

## Comandos de build

### Preparar o ambiente Node.js
- `npm install` (instala as dependencias listadas em `package.json`)
- `node -v` e `npm -v` (confirme as versoes apos configurar o Node)
- `npx vite --version` (confere se o Vite esta disponivel)

### Gerar a build
- `npm run build`

Se o Vite nao estiver presente ou o build falhar, reinstale os modulos e repita o build:
```
npm install
npx vite --version
npm run build
rm -rf node_modules
```

### Verificacao e correcoes
```
npm audit
npm audit fix
npm install nome-da-dependencia@latest
```

Duplicar o arquivo ".env.example" e renomear para ".env".<br>
Alterar no arquivo ".env" as credencias do banco de dados.<br>

Para a funcionalidade recuperar senha funcionar, necessÃ¡rio alterar as credenciais do servidor de envio de e-mail no arquivo .env.<br>
Utilizar o servidor fake durante o desenvolvimento: https://mailtrap.io<br>
Servidor Iagente: https://login.iagente.com.br/solicitacao-conta-smtp/origin/celke<br>
Configurar DNS da Iagente conforme a documentacao do provedor de e-mail.

# Instalation (`https://king.host/wiki/artigo/como-instalar-o-laravel-em-seu-site`)
1. install composer:
  - curl -sS https://getcomposer.org/installer | php
  - php composer.phar install --no-dev --optimize-autoloader



2. install laravel:
  - php -d memory_limit=1024M composer.phar create-project --prefer-dist laravel/laravel --prefer-dist www/
  - export PATH="$PATH:$HOME/.composer/vendor/bin"


Instalar as dependÃªncias do PHP.
```
php composer.phar install - kinghost
composer install - local
```

Instalar as dependÃªncias do Node.js.
```
npm install
```

Gerar a chave no arquivo .env.
```
php artisan key:generate
```

Executar as migration para criar a base de dados e as tabela.
```
php artisan migrate 

esse comando esta retirando o acesso a pasta www (para recuperar o acesso execute o comando abaixo via ssh na pasta rai)
chmod 777 www
```
//Psy Shell v0.12.4 (PHP 8.2.29 â€” cli) by Justin Hileman

find /www -type d -exec chmod 755 {} \;
find /www -type f -exec chmod 644 {} \;
chmod -R 775 /home/SEUUSER/www/meuprojeto/storage /home/SEUUSER/www/meuprojeto/bootstrap/cache

php artisan tinker


Cadastrar registro de teste.
```
php artisan db:seed
```

Iniciar o projeto criado com Laravel.
```
php artisan serve
```

Executar as bibliotecas Node.js.
```
npm run dev
```

Acessar no navegador a URL.
```
http://127.0.0.1:8000
```


## Sequencia para criar o projeto

Criar o projeto com Laravel.
```
composer create-project laravel/laravel .
```

Instalar o Breeze.
```
composer require laravel/breeze --dev
```

Publicar a atutenticaÃ§Ã£o, rotas, controladores e outros recursos para a aplicaÃ§Ã£o
```
php artisan breeze:install
```

* Selecionar React com Breeze, digitar "react".
* Selecionar recurso opcional, digitar "dark".
* Selecionar framework para teste, digitar "1".

Executar as migration para criar a base de dados e os tabela,
```
php artisan migrate
```

Instalar as dependÃªncias no Node.js.
```
npm install
```

Executar as bibliotecas Node.js.
```
npm run dev
```

Iniciar o projeto criado com Laravel.
```
php artisan serve
```

Acessar no navegador a URL.
```
http://127.0.0.1:8000
```

Criar seed.
```
php artisan make:seeder UserSeeder
```

Cadastrar registro de teste.
```
php artisan db:seed
```

## Como usar o GitHub

Verificar a versÃ£o do GIT.
```
git -v
```

Baixar os arquivos do GitHub.
```
git clone -b <branch_nome> <repositorio_url> .
git clone https://github.com/celkecursos/semana-um-laravel-react.git .
```

Verificar a branch.
```
git branch
```

Baixar as atualizaÃ§Ãµes do projeto.
```
git pull
```

Adicionar todos os arquivos modificados no staging area - Ã¡rea de preparaÃ§Ã£o.
```
git add .
```

commit representa um conjunto de alteraÃ§Ãµes em um ponto especÃ­fico da histÃ³ria do seu projeto, registra apenas as alteraÃ§Ãµes adicionadas ao Ã­ndice de preparaÃ§Ã£o.
O comando -m permite que insira a mensagem de commit diretamente na linha de comando.
```
git commit -m "DescriÃ§Ã£o do commit"
```

Enviar os commits locais, para um repositÃ³rio remoto.
```
git push <remote> <branch>
git push origin main
```

## Deploy na KingHost

### Ambiente de producao

No servidor da KingHost, use estas variaveis no `.env` de producao:

```env
APP_NAME=PEC
APP_ENV=production
APP_KEY=gerar_com_php_artisan_key_generate
APP_DEBUG=false
APP_TIMEZONE=America/Sao_Paulo
APP_URL=https://paoecafe83.com.br

DB_CONNECTION=mysql
DB_HOST=mysql.paoecafe83.com.br
DB_PORT=3306
DB_DATABASE=paoecafe83
DB_USERNAME=paoecafe83
DB_PASSWORD=sua_senha_de_banco

SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

CACHE_STORE=file
QUEUE_CONNECTION=sync
FILESYSTEM_DISK=local
APP_STORAGE=/home/paoecafe83/storage
```

### Publicacao

- O deploy principal acontece pelo workflow `.github/workflows/deploy.yml`.
- O pipeline faz build do PHP e do front-end, gera os assets e envia o conteudo para a KingHost por FTP.
- Como a KingHost trabalha com a pasta `www/`, o upload deve ser publicado nela para que o dominio encontre o `index.php` do projeto.
- Configure no GitHub Actions o segredo `KINGHOST_FTP_PASSWORD` com a senha do FTP.

### Passos iniciais no servidor

1. Criar o banco `paoecafe83` na KingHost.
2. Ajustar o `.env` de producao com os dados acima.
3. Executar `php artisan key:generate` uma unica vez no servidor, se a chave ainda nao existir.
4. Executar `php artisan migrate --force` para criar as tabelas no banco de producao.
5. Conferir permissao de escrita para `storage` e `bootstrap/cache`.

### Observacoes

- Os arquivos de deploy agora devem seguir o fluxo de FTP da KingHost.
- O banco de producao deve ser consultado diretamente na KingHost quando houver necessidade de validacao operacional.

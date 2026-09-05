Host FTP: ftp.pecp.kinghost.net
Usuario FTP: pecp
Caminho fisico: /home/pecp
Host FTP alternativo: ftp.web150.kinghost.net
senha: 6yh7uj8ik

Versao do servidor: MySQL 11.4
Host para conexao: mysql.pecp.kinghost.net
Host alternativo: mysql52-farm1.kinghost.net
Usuario para conexao: pecp
Senha: 6yh7uj8ik

## IMPORTANTE
- NUNCA RESTAURAR DUMP SEM UMA SOLICITACAO EXPRESSA POR ESCRITO
- AO FINAL DE UM TRABALHO, REALIZAR O DEPLOY/PUBLICACAO EM PRODUCAO
- SEMPRE LISTAR OS ARQUIVOS CRIADOS/ALTERADOS
- NAO USAR A CONTA AZURE "PAOECAFE"
- AO TRABALHAR COM AZURE, USAR APENAS AS SESSOES/CONTAS: CLERIO, ROBERTO, RODRIGO

## DEPLOY / BUILD
- Sempre gerar o build novo antes de publicar correcoes de frontend.
- Corrigir o fonte real em `resources/js/...` antes do build. Nao corrigir apenas `artifacts/staging/...`, porque o Vite compila a partir de `resources/js`.
- Em producao, conferir o HTML real entregue pelo site e validar qual caminho de assets ele referencia.
- O build local sai em `public/build`, mas a publicacao deve atualizar todos os manifests fisicos que a producao usa. Neste host, o navegador baixa assets por `https://pecp.kinghost.net/build/...`, mas o HTML renderizado pelo Laravel le manifests em `public/build` e/ou `www/build` no FTP.
- Para correcoes de frontend, o deploy deve publicar `public/build` em `build/`, `public/build/` e `www/build/` no FTP. O helper `scripts/deploy_lftp.sh` faz isso com `curl.exe`; nao depender de `lftp` nesta maquina.
- O `scripts/deploy_lftp.sh` sobe todos os arquivos do build tres vezes, uma para cada destino acima. Neste FTP, 2 minutos foi curto demais e causou timeout antes do fim; usar um timeout maior para garantir que `build/`, `public/build/` e `www/build/` fiquem com o mesmo `manifest.json` e os mesmos bundles.
- Se o PowerShell nao tiver `bash` no PATH, executar o deploy via Git Bash em `C:\\Program Files\\Git\\bin\\bash.exe` chamando `scripts/deploy_lftp.sh`. Foi o caminho que funcionou neste ambiente.
- Se a correcao alterar autorizacao, controller ou outra regra de backend Laravel, publicar tambem o arquivo PHP correspondente no FTP. Nesta ocorrencia, o sintoma parecia cache, mas o problema real era a controller em producao ainda com a regra antiga.
- Depois do deploy, validar pelo HTTP que `manifest.json` aponta para os novos hashes e que o bundle da pagina alterada responde na URL publica correta.
- Se a interface parecer ignorar uma correcao, confirmar primeiro se o problema e bundle antigo em producao antes de mexer na logica.

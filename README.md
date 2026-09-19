# InstaCheck v1

Aplicativo web/PWA para comparar as listas de seguidores e de contas seguidas exportadas pelo Instagram.

## O que já funciona
- Layout dark responsivo para celular.
- Upload de `.ZIP`, `.JSON` ou `.HTML`.
- Leitura local no navegador.
- Compara quem você segue com quem segue você.
- Mostra:
  - seguindo;
  - seguidores;
  - não seguem de volta;
  - seguidores mútuos.
- Pesquisa por usuário.
- Seleção múltipla.
- Abre o perfil no Instagram.
- Fluxo manual "Abrir próximo".
- Marca perfis como removidos no próprio aparelho.
- Salva a última análise no `localStorage`.
- PWA instalável.

## Privacidade
O arquivo é processado no navegador do usuário. Este projeto não recebe senha, cookies ou códigos de autenticação do Instagram.

## Importante
O app NÃO executa "unfollow" automaticamente dentro do Instagram. A confirmação para deixar de seguir é feita pelo próprio usuário no Instagram.

## Rodar localmente
```bash
npm install
npm start
```

Depois acesse `http://localhost:10000`.

## Publicar no Render
1. Envie todos os arquivos para um repositório no GitHub.
2. No Render, crie um **Web Service** usando esse repositório.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Publique.

## Estrutura
- `server.js` — servidor Express.
- `public/index.html` — interface.
- `public/style.css` — visual.
- `public/app.js` — análise e comparação.
- `public/manifest.webmanifest` — PWA.
- `public/sw.js` — cache básico.

## Exportação do Instagram
Na Central de Contas, exporte as informações relacionadas a seguidores e seguindo. JSON é o formato recomendado; HTML também é aceito.

# Ingestão temporária de vídeos do YouTube

## Comportamento

O botão **ADICIONAR** aceita links HTTPS de vídeos individuais em `youtube.com`/`youtu.be`. O controlador remove parâmetros de playlist e processa somente o ID do vídeo selecionado; também desativa o modo playlist do yt-dlp. Usa `yt-dlp` para obter a melhor combinação de vídeo e áudio disponível, combina os fluxos com FFmpeg e converte o resultado para MP4/H.264 (CRF 18) + AAC para reprodução no navegador. A interface exibe uma barra em duas fases: transferência (até 80% do progresso geral) e conversão para MP4 (80–99%); chega a 100% somente quando o arquivo está pronto. Durante a transferência, também mostra bytes recebidos, estado de conexão e aviso quando não chegam dados há algum tempo. A cor verde-azulada indica atividade; vermelho fica reservado para falhas. É possível cancelar a operação. A conversão usa CPU e espaço em disco local; a mídia não é enviada para a Bunny CDN nem para a AWS.

O arquivo fica em `~/.penumbra/cache/youtube/` (Windows: `%USERPROFILE%\\.penumbra\\cache\\youtube`) e expira após quatro horas. Há um download ativo por vez. Nesta fase, links de playlist sem um vídeo individual não são aceitos. Links que exijam login, cookies, DRM ou acesso privado não são contornados.

**Não há verificação de licença/direitos nesta fase.** O operador é responsável por possuir autorização para baixar e usar cada vídeo e por observar os termos aplicáveis. A ausência de uma checagem no aplicativo não significa que o download esteja autorizado.

## Dependências locais (Windows)

1. Instale `uv` e Node.js 20+.
2. Instale yt-dlp com os componentes recomendados para suporte completo ao YouTube:

   ```powershell
   uv tool install "yt-dlp[default]"
   ```

   `yt-dlp[default]` inclui o pacote de scripts EJS exigido atualmente pelo YouTube. O controlador passa o executável Node.js em uso como runtime de JavaScript.
3. Instale FFmpeg com o encoder `libx264`; ele precisa estar no `PATH`. Se o executável não estiver no `PATH`, defina `PENUMBRA_FFMPEG_BIN` como caminho absoluto para `ffmpeg.exe`. Se `yt-dlp.exe` não estiver no `PATH`, defina `PENUMBRA_YTDLP_BIN` como caminho absoluto para ele. Para mover o cache, defina `PENUMBRA_YOUTUBE_CACHE_DIR`.
4. Confirme as dependências no terminal usado para iniciar o Penumbra:

   ```powershell
   yt-dlp --version
   ffmpeg -hide_banner -encoders
   ```

   A listagem de encoders deve conter `libx264`. Reinicie o controlador depois de alterar `PATH` ou as variáveis.
5. Inicie o Penumbra com `npm start`. Se uma dependência estiver ausente, o status de ingestão mostra a falha; nenhum download é enviado para serviço remoto.

## Limpeza

Os arquivos concluídos são removidos após quatro horas enquanto o controlador está ativo. Um reinício do controlador invalida os IDs temporários da sessão anterior; arquivos órfãos com mais de quatro horas também são removidos quando o controlador inicia. Para limpeza manual imediata, feche o Penumbra e remova somente a pasta `~/.penumbra/cache/youtube/`.

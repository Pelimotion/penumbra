# Documentação oficial

## Escopo

Penumbra é uma ferramenta de performance audiovisual que combina um cockpit web de vídeo/visuais, análise de áudio e integrações opcionais com MIDI e TouchDesigner. O motor visual roda no navegador; o serviço Node local se comunica com o cockpit e componentes na própria máquina, escutando somente em loopback por padrão — não há acesso pela LAN/internet nessa configuração.

## Mapa do repositório

| Caminho | Responsabilidade |
|---|---|
| `penumbra_engine/web_controller/public/` | Aplicação web: interface, renderização, mídia, estilos e MIDI |
| `penumbra_engine/web_controller/server.js` | Serviço local Express/WebSocket |
| `penumbra_engine/audio_engine/` | Utilitários de análise/processamento de áudio em Python |
| `penumbra_engine/orchestrator/` | Orquestração e ponte com ferramentas externas |
| `penumbra_engine/touchdesigner/` | Projeto e scripts de TouchDesigner |
| `penumbra_engine/media_pool/` | Mídia, mattes, thumbnails e manifests |
| `scripts/` | Geração de bundle, sync, documentação e deploy |
| `DECISOES.md` | Registro de decisões arquiteturais |
| `STATE.md` | Estado operacional mantido pelo projeto |

## Execução local

Requisitos recomendados: Node.js 20+, npm e Python 3. Instale as dependências do controlador e inicie-o:

```bash
npm install --prefix penumbra_engine/web_controller
npm start
```

O `npm start` da raiz inicia o servidor local. Consulte a saída do processo para o endereço e eventuais erros. Para abrir a aplicação sem o controlador, sirva `penumbra_engine/web_controller/public/` por um servidor estático local; abrir `index.html` diretamente pode impedir APIs do navegador que exigem origem segura.

Para configurar a ingestão temporária de YouTube (yt-dlp + FFmpeg), consulte [youtube-ingest.md](youtube-ingest.md).

## Fluxos e dependências de ambiente

- Recursos de áudio/MIDI dependem de permissões e compatibilidade do navegador/dispositivo.
- Comunicação com TouchDesigner depende da configuração local e de portas/rede coerentes nos dois lados.
- O scanner e a sincronização de mídia aceitam a raiz com `PENUMBRA_MEDIA_ROOT`; sem a variável, mantêm o caminho legado do autor. O scanner reporta raiz ausente em vez de escrever manifesto vazio. O endpoint de rescan ainda espera `python3` no `PATH`.
- A versão portátil é produzida por `npm run bundle`; valide mídia, tamanho e funcionamento offline antes de distribuir.
- Scripts de deploy sincronizam/publicam conteúdo externo. Não os execute como parte de testes sem autorização e configuração deliberada.

## Qualidade

```bash
npm test
node --check penumbra_engine/web_controller/server.js
python -m compileall -q penumbra_engine
```

O teste automatizado usa `node:test`. A sintaxe verificada não comprova comportamento funcional. Testes com navegador, performance de renderização, dispositivos, TouchDesigner, rede real e CDN devem ser registrados separadamente com ambiente e resultado.

## Segurança e operação

1. O controlador local e o Audio Brain escutam somente em `127.0.0.1`; não os exponha à rede. O WebSocket do controlador rejeita origem de navegador diferente de `localhost`/`127.0.0.1` na porta configurada. Clientes nativos sem cabeçalho `Origin` continuam possíveis apenas pela interface loopback.
2. O frontend ainda contém caminhos legados de modo LAN e de conexão cloud→IP local configurado. Eles não funcionam com a política local-only; não reative acesso remoto sem decisão do mantenedor e autenticação/autorização apropriadas.
3. Mantenha tokens, segredos e `.env` fora do Git. Rotacione qualquer credencial publicada acidentalmente.
4. Valide origem, formato, tamanho e caminho de arquivos recebidos antes de processá-los.
5. Deploy e sincronização com CDN são operações com efeitos externos; revisar diff e destino, obter autorização do mantenedor e validar remotamente após publicar.
6. O deploy exige `BUNNY_STORAGE_PASSWORD` via ambiente ou `.env` local; sem a variável, falha antes de gerar ou enviar arquivos. Como uma credencial já esteve hard-coded em histórico público, trate-a como comprometida e peça ao mantenedor para revogá-la/rotacioná-la no Bunny; remover o fallback não apaga o histórico Git.
7. O PIN do modo CDN é apenas uma barreira visual no cliente, não autenticação: manifesto e recursos servidos publicamente continuam acessíveis por URL. Não o use para proteger conteúdo; restrição real exige controle de acesso no servidor/CDN.
8. Respeite licenças e direitos de autor para código, vídeos, áudio e imagens.

## Contribuição e mudanças

Antes de alterar arquitetura, consulte `DECISOES.md` e as invariantes em `.agents/invariants/invariants.md`. Mudanças devem incluir motivação, risco, passos para reproduzir, testes executados e limitações conhecidas. Atualize esta documentação quando comandos, portas, requisitos ou fluxos mudarem.

## Referências internas

- [README e guia rápido](../README.md)
- [Arquitetura técnica detalhada](ARCHITECTURE.md)
- [Decisões arquiteturais](../DECISOES.md)
- [Changelog](../CHANGELOG.md)

# Penumbra System

Sistema VJ audio-reativo para performance visual, com interface web, reprodução e processamento de mídia, integração MIDI e controladores locais para TouchDesigner.

> Este repositório está em desenvolvimento ativo. Recursos, compatibilidade e segurança operacional devem ser validados no ambiente de performance antes de uso público.

## Componentes

- **Cockpit web:** `penumbra_engine/web_controller/public/` — JavaScript, HTML, CSS e WebGL.
- **Controlador local:** `penumbra_engine/web_controller/server.js` — serviço Node.js/Express e WebSocket para o cockpit e automação local; escuta somente em loopback por padrão.
- **Áudio:** `penumbra_engine/audio_engine/` — análise de áudio em Python.
- **Orquestração:** `penumbra_engine/orchestrator/` — integração com TouchDesigner.
- **Mídia:** `penumbra_engine/media_pool/` e `1. In/` — assets locais; alguns conteúdos podem ser grandes ou sujeitos a direitos autorais.
- **Scripts:** `scripts/` — geração do bundle portátil, documentação e integração de mídia/deploy.
- **Decisões e arquitetura:** `DECISOES.md`, `docs/ARCHITECTURE.md`, `STATE.md`.

## Requisitos

- Node.js 20 ou superior recomendado.
- npm compatível com a versão do Node.
- Python 3 para ferramentas de áudio e orquestração.
- TouchDesigner apenas para os fluxos que o integram.
- O scanner e a faixa de áudio configurados no código dependem dos caminhos absolutos do ambiente do autor; veja [limitações de ambiente](docs/README.md#fluxos-e-dependências-de-ambiente).

## Começar

```bash
git clone https://github.com/Pelimotion/penumbra.git
cd penumbra
npm install --prefix penumbra_engine/web_controller
npm start
```

Abra o endereço local indicado no terminal. O modo web estático pode ser executado sem o controlador local; integrações de rede dependem do servidor, das permissões de firewall e da configuração do ambiente.

## Testes e verificações

```bash
npm test
node --check penumbra_engine/web_controller/server.js
python -c "from pathlib import Path; [compile(p.read_bytes(), str(p), 'exec') for p in Path('penumbra_engine').rglob('*.py')]"
```

`npm test` executa os testes automatizados com o runner nativo do Node.js; `npm run test:python` executa os testes Python do scanner e do relógio musical. `npm run test:docs` roda apenas as verificações de documentação. Ainda não há garantia de cobertura de hardware MIDI, TouchDesigner, WebMIDI, WebGL, dispositivos de áudio ou deploy/CDN; teste esses fluxos manualmente em ambiente controlado.

## Bundle portátil

```bash
npm run bundle
```

O script gera a versão portátil conforme a implementação atual. Revise o arquivo gerado antes de distribuir; não inclua credenciais nem mídia sem autorização.

## Configuração e segurança

- Nunca commit credenciais, tokens, PINs privados ou arquivos `.env`.
- O controlador local e o Audio Brain escutam somente em `127.0.0.1`; eles não devem ser expostos à internet nem à rede local. O WebSocket do controlador aceita somente a origem local da interface (clientes nativos sem `Origin` ainda podem conectar localmente).
- A interface tem caminhos antigos de modo LAN/controle por IP configurado; eles não funcionam com a política local-only do servidor. Não reative escuta remota sem decisão do mantenedor e implementação de autenticação/autorização adequada.
- MIDI, áudio, arquivos locais e APIs do navegador podem exigir permissões explícitas e suporte do browser.
- Consulte `DECISOES.md` antes de alterar decisões registradas e mantenha `CHANGELOG.md` atualizado conforme o projeto.

## Deploy

Deploy/CDN altera serviço externo e pode publicar conteúdo. Não execute `npm run deploy` ou `npm run ship` sem revisar as credenciais, o escopo e obter autorização explícita do responsável.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Ingestão temporária de vídeos do YouTube](docs/youtube-ingest.md)
- [Decisões arquiteturais (ADRs)](DECISOES.md)
- [Estado do projeto](STATE.md)
- [Histórico de alterações](CHANGELOG.md)
- [Instruções para agentes](AGENTS.md)

## Contribuição

Abra uma issue descrevendo o comportamento esperado e observado, ambiente, passos para reproduzir e evidências. Para mudanças, inclua teste reproduzível quando aplicável, execute as verificações acima e descreva riscos de performance, hardware e deploy. Não faça merge ou publicação sem aprovação do mantenedor.

## Licença

Nenhum arquivo de licença foi identificado na raiz. Até que o mantenedor adicione uma licença, não presuma permissão para redistribuir, modificar ou usar comercialmente o código ou a mídia.

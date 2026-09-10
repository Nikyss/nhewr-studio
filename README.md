# Nhewr Studios

Editor local de ícones em português. Tema branco e modo escuro neutro, com foco em computadores (1024 px ou mais) e versão **V1.0.2**. As cores de edição são livres; a paleta de cores salvas começa vazia.

## Abrir no Windows

Extraia o ZIP e execute **INICIAR.bat**. O inicializador usa Node.js compatível já instalado ou baixa uma cópia portátil oficial com verificação SHA-256. O navegador padrão abre automaticamente. Não precisa de conta, hospedagem nem instalação global.

O pacote de distribuição inclui a interface compilada. No código-fonte baixado pelo GitHub, o inicializador também instala as dependências e compila na primeira execução. A primeira preparação requer internet; depois o editor funciona offline. Mantenha a janela do servidor aberta durante o uso. Ctrl+C encerra.

## Ferramentas

- Troca de uma cor ou recoloração integral, seletor visual, HEX/RGB/ARGB/RGBA/HSL e conta-gotas.
- Leitura de cor em tempo real junto ao cursor e no painel: HEX, RGBA, posição e transparência.
- Zoom independente no original e no resultado, no ponto do cursor pela roda, arraste e ajuste com duplo clique. Cursor de seta durante a leitura de pixels.
- Similaridade 0–100%, suavização de bordas, comparação e máscara de alterações exportável.
- Remoção por cor, remoção apenas de áreas conectadas às bordas, opacidade e fundo.
- Redimensionamento proporcional, recorte de margens, margem externa, rotação e espelhamento.
- Escala de cinza e inversão de cores.
- Histórico independente por imagem, cores detectadas sem tons quase duplicados e paleta JSON.
- Importação PNG/JPG/WebP/SVG/ICO por arquivos, arrastar ou colar.
- Exportação PNG por padrão, WebP/JPG/ICO, cópia PNG e lote ZIP com seleção de arquivos e nomes exclusivos. Por padrão cada imagem mantém seus próprios ajustes.

Com o conta-gotas ativo, Alt+arrastar ou botão do meio move a imagem. Escape sai da captura. O fundo da prévia não é adicionado ao arquivo exportado. O original é preservado.

## Desenvolvimento

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm run build
npm test
npm start
```

O servidor de distribuição usa apenas módulos nativos do Node e atende em `127.0.0.1`. Se a porta estiver ocupada, escolhe outra; uma instância do mesmo projeto e versão é reutilizada. `node scripts/local-server.mjs --no-open --port 5174` inicia sem abrir o navegador.

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/iniciar.ps1 -CheckOnly` verifica/prepara o ambiente. Adicione `-Portable` para exercitar o download portátil mesmo com Node instalado. Nenhuma política permanente do Windows é alterada.

## Limites

50 imagens, 20 MB por arquivo, 16 megapixels por imagem e 32 megapixels de originais por sessão; até 8.192 px por lado. SVG é rasterizado, sem saída vetorial. ICO contém PNG quadrado de até 256 px. Remoção de fundo é por cor, sem inteligência artificial. PNG é recomendado quando a cor exata importa; JPG e WebP usam compressão com perdas.

As imagens e o histórico permanecem na memória da sessão. Recarregar a página os descarta. Somente as cores salvas e o tema persistem localmente. O conta-gotas mede os pixels decodificados pelo navegador; telas com perfis de cor diferentes podem exibir a mesma cor de forma diferente.

## Base Técnica

React e Vite, controles Radix, [Culori](https://github.com/Evercoder/culori) para cores, [Pica](https://github.com/nodeca/pica) para redimensionamento, [fflate](https://github.com/101arrowz/fflate) para ZIP e [Lucide](https://github.com/lucide-icons/lucide) para ícones. O processamento de pixels usa Web Worker com alternativa local. A interface é inspirada funcionalmente no [Change Icon Colors](https://onlinepngtools.com/change-icon-colors), com implementação própria.

Créditos do criador em `creditos/criador.txt`. Licenças de terceiros em `creditos/TERCEIROS.txt`.

## Formatos de Cor

`#1677AA` e `rgb(22,119,170)` representam a mesma cor opaca. `argb(128,22,119,170)` usa alfa de 0 a 255 antes de R, G e B. Também são aceitos `0x801677AA` e `argb(#801677AA)`, com a ordem AARRGGBB explícita. HEX CSS de oito dígitos mantém RRGGBBAA: `#1677AA80`. RGBA usa alfa de 0 a 1: `rgba(22,119,170,0.5)`.

PNG preserva áreas transparentes com alfa 0 e bordas semitransparentes. Não adiciona o fundo branco, escuro ou quadriculado da prévia. Um fundo que já faz parte da imagem só fica transparente quando removido pela ferramenta Transparência; recolorir não apaga fundos automaticamente.

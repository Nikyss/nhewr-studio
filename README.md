# Nhewr Studios

Editor local de ícones em português. Tema branco e modo escuro neutro, com layout adaptável a janelas estreitas e versão **V1.0.3**. As cores de edição são livres; a paleta de cores salvas começa vazia.

[Baixar a V1.0.3 para Windows](https://github.com/Nikyss/nhewr-studio/releases/tag/v1.0.3) · [Notas da versão](CHANGELOG.md)

## Abrir no Windows

Extraia o ZIP e execute **INICIAR.bat**. O inicializador usa Node.js compatível já instalado ou baixa uma cópia portátil oficial com verificação SHA-256. O navegador padrão abre automaticamente. Não precisa de conta, hospedagem nem instalação global.

O pacote de distribuição inclui a interface compilada. No código-fonte baixado pelo GitHub, o inicializador também instala as dependências e compila na primeira execução. A primeira preparação requer internet; depois o editor funciona offline. Mantenha a janela do servidor aberta durante o uso. Ctrl+C encerra.

## Ferramentas

- Várias trocas de cor simultâneas por imagem, recoloração integral, seletor visual, HEX/RGB/ARGB/RGBA/HSL e conta-gotas.
- Uniformização opcional de tons quase iguais, preservando grupos de cores claramente diferentes.
- Leitura de cor em tempo real junto ao cursor e no painel: HEX, RGBA, posição e transparência.
- Zoom independente no original e no resultado, no ponto do cursor pela roda, arraste e ajuste com duplo clique. Cursor de seta durante a leitura de pixels.
- Similaridade 0–100%, suavização de bordas, comparação e máscara de alterações exportável.
- Até 16 remoções por cor com ajustes próprios, além de borracha, balde por HEX, laço, opacidade e fundo.
- Redimensionamento proporcional, recorte de margens, margem externa, rotação e espelhamento.
- Melhoria de qualidade com jSquash/Squoosh em WebAssembly: ampliação 1×/2×/4×, suavização do contorno transparente, RGB protegido, Lanczos 3 e Magic Kernel.
- Escala de cinza e inversão de cores.
- Histórico independente por imagem, cores detectadas sem tons quase duplicados e paleta JSON.
- Importação PNG/JPG/WebP/SVG/ICO por arquivos, arrastar ou colar.
- Exportação PNG por padrão, WebP/JPG/ICO, cópia PNG e lote ZIP com seleção de arquivos e nomes exclusivos. Por padrão cada imagem mantém seus próprios ajustes.

Com o conta-gotas ou uma ferramenta manual ativa, Alt+arrastar ou botão do meio move a imagem. Borracha, balde e laço atuam na prévia Original e entram no histórico de desfazer/refazer. Escape sai da captura ou cancela o gesto atual. O fundo da prévia não é adicionado ao arquivo exportado. O original é preservado.

A prévia mantém os pixels sem interpolação durante a exibição. Isso evita que um color picker externo leia, por exemplo, `#FE7020` na tela quando o PNG contém exatamente `#FF7020`. A validação do arquivo continua sendo feita pelo PNG exportado.

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

As imagens e o histórico permanecem na memória da sessão. Recarregar a página os descarta. Somente as cores salvas e o tema persistem localmente. O conta-gotas lê os canais do PNG diretamente; outros formatos são decodificados pelo navegador. Telas com perfis de cor diferentes podem exibir a mesma cor de forma diferente.

## Base Técnica

React e Vite, controles Radix, [Culori](https://github.com/Evercoder/culori) para cores, [Pica](https://github.com/nodeca/pica) para redimensionamento comum, [jSquash Resize](https://github.com/jamsinclair/jSquash/tree/main/packages/resize) para melhoria WebAssembly, [fflate](https://github.com/101arrowz/fflate) para ZIP e [Lucide](https://github.com/lucide-icons/lucide) para ícones. O processamento de pixels usa Web Workers. A interface é inspirada funcionalmente no [Change Icon Colors](https://onlinepngtools.com/change-icon-colors), com implementação própria.

Créditos do criador em `creditos/criador.txt`. Licenças de terceiros em `creditos/TERCEIROS.txt`.

## Formatos de Cor

`#1677AA` e `rgb(22,119,170)` representam a mesma cor opaca. `argb(128,22,119,170)` usa alfa de 0 a 255 antes de R, G e B. Também são aceitos `0x801677AA` e `argb(#801677AA)`, com a ordem AARRGGBB explícita. HEX CSS de oito dígitos mantém RRGGBBAA: `#1677AA80`. RGBA usa alfa de 0 a 1: `rgba(22,119,170,0.5)`.

PNG preserva áreas transparentes com alfa 0 e bordas semitransparentes. Não adiciona o fundo branco, escuro ou quadriculado da prévia. Um fundo que já faz parte da imagem só fica transparente quando removido pela ferramenta Transparência; recolorir não apaga fundos automaticamente.

## Precisão de PNG

A leitura e gravação de PNG usam os canais RGB/alfa diretamente, com fast-png, sem utilizar a prévia do canvas como fonte dos pixels. Isso evita o arredondamento de RGB causado pela conversão de alfa pré-multiplicado. A saída é PNG RGBA de 8 bits; PNG de 16 bits é convertido para 8 bits.

Para substituição exata, deixe "Mesclar cores nas bordas" desligado. Mistura de bordas, filtros, redimensionamento e composição com fundo podem gerar novas cores por definição. O botão "Usar cor original como nova cor" copia o valor do campo sem capturar outro pixel.

O conta-gotas interno lê o RGB do arquivo, junto do alfa. Um pixel semitransparente é misturado com o fundo na tela; uma extensão que captura a tela pode medir essa mistura e a interpolação do zoom, não o RGB armazenado no PNG. "Inspecionar RGB sem transparência" mostra canais RGB opacos apenas na prévia; o arquivo exportado conserva o alfa. Use 100% para conferir pixels individuais. Perfis de cor do sistema e o comportamento de extensões externas não são controlados pelo editor.

## Melhorar Qualidade

1. Importe o ícone e abra **Melhorar qualidade**.
2. Ative a melhoria e escolha 1× (mesmo tamanho), 2× ou 4×.
3. Para ícones com cores obrigatórias, mantenha **Preservar RGB · ícones**. O contorno é suavizado pelo alfa; os canais RGB são copiados de pixels visíveis, sem criar tons intermediários nesta etapa.
4. Ajuste **Suavizar contorno transparente**. Valores altos podem deixar traços finos mais suaves ou menos opacos. Compare a 100% e exporte em PNG.
5. Para fotos, gradientes ou desenhos com transições internas, escolha **Imagem suave · Lanczos 3** ou **Imagem nítida · Magic Kernel**. Esses métodos interpolam cores; os valores HEX podem mudar.

A melhoria começa desligada e é independente para cada imagem, incluindo histórico e exportação em lote. O jSquash deriva do Squoosh e executa algoritmos Rust/WebAssembly inteiramente no dispositivo. Não usa IA nem vetorização e não recupera detalhes ausentes. Em imagens totalmente opacas, a suavização do contorno transparente não tem efeito; remova o fundo primeiro ou use um método de imagem para transições internas. O modo RGB protegido conserva também as divisões internas entre cores, que podem continuar serrilhadas.

Com Redimensionar e Melhorar qualidade ativos, as dimensões escolhidas são multiplicadas pela ampliação e aplicadas em uma única reamostragem. A ordem é: cores/remoção/opacidade, recorte, tamanho e melhoria, rotação/espelhamento/margem, fundo. O limite continua 16 MP e 8.192 px por lado, inclusive na saída. O processamento da melhoria roda em um Web Worker e é cancelado quando os ajustes mudam.

Preservar RGB vale para a etapa de qualidade: mesclar cores na aba de cor, filtros e fundo preenchido ainda podem alterar o RGB. Suavizar o contorno altera o alfa e, portanto, a aparência sobre o fundo, mas não o RGB protegido. Para a cor corporativa #FF7020, deixe a mistura de cores desligada, escolha Preservar RGB e mantenha o fundo transparente.

## Fundo e Transparência

- **Por cor** apaga a cor escolhida no original e pode ser usada junto com recoloração. Cada faixa fixada conserva cor, intensidade, tons parecidos, suavização e alcance próprios; até 16 faixas podem atuar ao mesmo tempo.
- **Fixar e adicionar outra** preserva a faixa atual antes de escolher o próximo HEX. Também é possível editar ou excluir cada faixa separadamente.
- **Fundo conectado às bordas** preserva regiões fechadas da mesma cor dentro do desenho. **Toda a imagem** remove também essas regiões.
- **Intensidade da remoção**: começa em 0%. A cor escolhida só vai desaparecendo conforme o controle avança; 100% apaga completamente.
- **Incluir tons parecidos**: 0% afeta apenas o RGB exato; aumentar inclui cores semelhantes.
- **Suavização do recorte**: mantém os pixels selecionados totalmente transparentes e reduz parcialmente o alfa dos vizinhos do recorte, sem misturar RGB. Não é remoção por IA nem descontaminação de halos coloridos.
- **Borracha** remove somente o traço feito na imagem, com diâmetro e intensidade ajustáveis.
- **Balde** captura o RGB clicado e remove de uma vez todos os pixels iguais ou próximos no arquivo.
- **Laço** acompanha uma linha livre e remove tudo dentro da área quando o gesto é fechado. As ações manuais podem ser desfeitas ou limpas sem alterar o original.
- **Opacidade**: 100% mantém o alfa original, 0% deixa o ícone invisível. Não torna pixels transparentes opacos.
- **Preservar transparência** não acrescenta um fundo e não remove automaticamente um fundo já presente. **Preencher com uma cor** adiciona a cor escolhida ao arquivo exportado.

Restaurar esta ferramenta, em Transparência ou Qualidade, restaura apenas os controles dessa aba. Restaurar original, na área de trabalho, continua restaurando todos os ajustes. As ferramentas manuais usam coordenadas do original antes de recorte, redimensionamento ou rotação.

## Pacote de Distribuição

Depois de `npm run typecheck`, `npm test` e `npm run build`, execute:

```sh
node scripts/third-party-notices.mjs
node scripts/package-release.mjs
```

O ZIP inclui código-fonte, interface compilada, INICIAR.bat, documentação e licenças; não inclui node_modules, credenciais nem o runtime da máquina do desenvolvedor. O arquivo `.sha256` acompanha a publicação. Ao atualizar, extraia em uma nova pasta para não reutilizar uma interface compilada de outra versão.

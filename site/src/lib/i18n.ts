/** Two languages, one set of pages.
 *
 * English keeps the URLs it already has (`/al-pulse/…`) and Portuguese sits
 * under `/al-pulse/pt/…`. The site has been published and linked for a while;
 * moving English to `/en/` to make the routing symmetrical would break every
 * one of those links to buy nothing a reader can see.
 *
 * Two rules about what lives here:
 *
 * - **Short UI strings go in the dictionary, long-form prose does not.** The
 *   method page is two pages of dense explanation; shredding it into fifty
 *   dictionary keys would make it unreadable and unmaintainable in both
 *   languages at once. It has one file per language instead. Anything that is
 *   a label, a heading or a sentence fragment belongs here.
 * - **Data is not translated.** Area names are proper nouns — Ponta Delgada is
 *   Ponta Delgada. What does get translated is the vocabulary *about* the
 *   data: "municipality", "3 rooms", "no change".
 *
 * The dictionary is keyed by string and every entry carries both languages, so
 * a missing translation is a type error rather than a page that silently falls
 * back to English.
 *
 * Portuguese here is **pt-PT**, not pt-BR: freguesia not bairro, "a decorrer"
 * not "em andamento", and the European spellings throughout. The audience is
 * Portuguese.
 */

export const LANGS = ['en', 'pt'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'en';

/** BCP-47 tags, for `<html lang>`, `hreflang` and Intl. */
export const LOCALE: Record<Lang, string> = {
  en: 'en-GB',
  pt: 'pt-PT',
};

export const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  pt: 'Português',
};

/** Shown instead of the full name below 620px. "English | Português" is 140px
 * of a 360px header, which pushed the bar to a third row and left every
 * in-page anchor landing underneath it. */
export const LANG_SHORT: Record<Lang, string> = {
  en: 'EN',
  pt: 'PT',
};

function entry<T extends Record<Lang, string>>(v: T): T {
  return v;
}

const DICT = {
  // ------------------------------------------------------------------ chrome
  'nav.overview': entry({ en: 'Overview', pt: 'Visão geral' }),
  'nav.map': entry({ en: 'Map', pt: 'Mapa' }),
  'nav.areas': entry({ en: 'Areas', pt: 'Áreas' }),
  'nav.method': entry({ en: 'Method', pt: 'Metodologia' }),
  'nav.skip': entry({ en: 'Skip to content', pt: 'Saltar para o conteúdo' }),
  'theme.group': entry({ en: 'Colour theme', pt: 'Tema de cor' }),
  'theme.light': entry({ en: 'Light', pt: 'Claro' }),
  'theme.auto': entry({ en: 'Auto', pt: 'Auto' }),
  'theme.dark': entry({ en: 'Dark', pt: 'Escuro' }),
  'theme.light.title': entry({ en: 'Light', pt: 'Claro' }),
  'theme.auto.title': entry({ en: 'Follow system', pt: 'Seguir o sistema' }),
  'theme.dark.title': entry({ en: 'Dark', pt: 'Escuro' }),
  'lang.group': entry({ en: 'Language', pt: 'Idioma' }),

  // ------------------------------------------------------------------ footer
  'footer.source': entry({
    en: 'Data through {month} from the Registo Nacional de Turismo, and for the Azores from the Região Autónoma dos Açores’ own register.',
    pt: 'Dados até {month} do Registo Nacional de Turismo e, para os Açores, do registo da própria Região Autónoma dos Açores.',
  }),
  'footer.counts': entry({
    en: '{localities} localities, {municipalities} municipalities, {regions} districts and autonomous regions.',
    pt: '{localities} freguesias, {municipalities} municípios, {regions} distritos e regiões autónomas.',
  }),
  'footer.azores': entry({
    en: 'The Azorean register records no dates, so those {n} areas are counted but never charted.',
    pt: 'O registo açoriano não regista datas, pelo que essas {n} áreas são contadas mas nunca representadas em gráficos.',
  }),
  'footer.method': entry({
    en: 'How this is built, and what it cannot tell you',
    pt: 'Como isto é construído, e o que não lhe consegue dizer',
  }),

  // ------------------------------------------------------------- area levels
  'level.region': entry({ en: 'district', pt: 'distrito' }),
  'level.region.plural': entry({ en: 'districts', pt: 'distritos' }),
  'level.municipality': entry({ en: 'municipality', pt: 'município' }),
  'level.municipality.plural': entry({ en: 'municipalities', pt: 'municípios' }),
  'level.locality': entry({ en: 'locality', pt: 'freguesia' }),
  'level.locality.plural': entry({ en: 'localities', pt: 'freguesias' }),

  // -------------------------------------------------------------- room sizes
  // Keyed on the canonical English value the mart emits, so the join stays in
  // one language and only the label changes.
  'rooms.0': entry({ en: '0 rooms', pt: '0 quartos' }),
  'rooms.1': entry({ en: '1 room', pt: '1 quarto' }),
  'rooms.2': entry({ en: '2 rooms', pt: '2 quartos' }),
  'rooms.3': entry({ en: '3 rooms', pt: '3 quartos' }),
  'rooms.more': entry({ en: 'More than 3 rooms', pt: 'Mais de 3 quartos' }),

  // ------------------------------------------------------------------ tables
  'table.area': entry({ en: 'Area', pt: 'Área' }),
  'table.al_count': entry({ en: 'AL count', pt: 'N.º de AL' }),
  'table.growth': entry({ en: 'Growth, 3 yr', pt: 'Crescimento, 3 anos' }),
  'table.inhabitants': entry({ en: 'Inhabitants per AL', pt: 'Habitantes por AL' }),
  'table.rank': entry({ en: 'Rank', pt: 'Posição' }),
  'table.rank_change': entry({ en: 'Rank change', pt: 'Variação de posição' }),
  'table.search': entry({ en: 'Search {n} areas…', pt: 'Pesquisar {n} áreas…' }),
  'table.search_label': entry({ en: 'Search {what}', pt: 'Pesquisar {what}' }),
  'table.areas_shown': entry({ en: '{n} areas', pt: '{n} áreas' }),
  'table.show_all': entry({ en: 'Show all {n}', pt: 'Mostrar todas ({n})' }),
  'table.show_first': entry({ en: 'Show first {n}', pt: 'Mostrar as primeiras {n}' }),
  'table.no_change': entry({ en: 'no change', pt: 'sem alteração' }),
  'table.na': entry({ en: 'n/a', pt: 'n/d' }),
  'table.na_note': entry({
    en: 'n/a — the Azores keep a separate register that records no registration dates, so growth and rank cannot be computed for those areas. Their AL counts are current and real.',
    pt: 'n/d — os Açores mantêm um registo separado que não regista datas de registo, pelo que não é possível calcular crescimento nem posição para essas áreas. As contagens de AL são atuais e reais.',
  }),

  // ------------------------------------------------------------------ charts
  'chart.total': entry({ en: 'Total registered', pt: 'Total registado' }),
  'chart.new_month': entry({ en: 'New that month', pt: 'Novos nesse mês' }),
  'chart.lost_cum': entry({ en: 'Lost, cumulative', pt: 'Perdidos, acumulado' }),
  'chart.lost_month': entry({ en: 'Lost that month', pt: 'Perdidos nesse mês' }),
  'chart.read_hint': entry({
    en: 'Hover, tap or focus the chart and use the arrow keys to read any month.',
    pt: 'Passe o rato, toque ou foque o gráfico e use as setas para ler qualquer mês.',
  }),

  // ------------------------------------------------------------- event marks
  'events.key_title': entry({ en: 'The dashed marks', pt: 'As marcas tracejadas' }),
  'events.key_count': entry({
    en: '{n} changes to the law',
    pt: '{n} alterações à lei',
  }),
  'events.key_count_one': entry({
    en: '1 change to the law',
    pt: '1 alteração à lei',
  }),
  'events.same_marks': entry({
    en: 'The same marks, on this chart',
    pt: 'As mesmas marcas, neste gráfico',
  }),

  // -------------------------------------------------------------- map page
  'map.title': entry({
    en: 'Every locality, mapped — AL Pulse',
    pt: 'Todas as freguesias no mapa — AL Pulse',
  }),
  'map.description': entry({
    en: 'Choropleth of every Portuguese locality by registered short-lets.',
    pt: 'Mapa coroplético de todas as freguesias portuguesas por alojamentos locais registados.',
  }),
  'map.h1': entry({ en: 'Where the short-lets are', pt: 'Onde estão os alojamentos locais' }),
  'map.lede': entry({
    en: 'All {n} localities with a registered Alojamento Local, as of {month} — including the {azores} Azorean ones, which come from a separate register and carry a count but no rank',
    pt: 'Todas as {n} freguesias com Alojamento Local registado, em {month} — incluindo as {azores} dos Açores, que vêm de um registo separado e têm contagem mas não posição',
  }),
  'map.lede_end': entry({
    en: '. Drag to pan, scroll or use the buttons to zoom, and hover or tap any locality to open it.',
    pt: '. Arraste para deslocar, use a roda ou os botões para ampliar, e passe o rato ou toque numa freguesia para a abrir.',
  }),
  'map.bins': entry({
    en: 'Colour bins are quantiles for counts and residents, so each shade holds the same number of localities — that keeps the ramp readable when a handful of places dwarf everywhere else. Rank is uniform by construction, so it uses geometric bins instead; quantiles would put the whole top of the table in one shade. Basemap by',
    pt: 'As classes de cor são quantis para contagens e residentes, pelo que cada tom contém o mesmo número de freguesias — é isso que mantém a escala legível quando meia dúzia de lugares esmaga todos os outros. A posição é uniforme por construção, pelo que usa classes geométricas; com quantis, todo o topo da tabela ficaria com o mesmo tom. Mapa base por',
  }),
  'map.bins_end': entry({
    en: 'data: vector tiles served without an API key, and the only page on this site that loads a map library.',
    pt: 'dados: mosaicos vetoriais servidos sem chave de API, e a única página deste site que carrega uma biblioteca de mapas.',
  }),

  // ------------------------------------------------------------ areas index
  'areas.title': entry({ en: 'Every area — AL Pulse', pt: 'Todas as áreas — AL Pulse' }),
  'areas.description': entry({
    en: 'Search and sort every Portuguese district, municipality and locality by registered short-lets.',
    pt: 'Pesquise e ordene todos os distritos, municípios e freguesias de Portugal por alojamentos locais registados.',
  }),
  'areas.h1': entry({ en: 'Every area', pt: 'Todas as áreas' }),
  'areas.lede': entry({
    en: '{regions} districts, {municipalities} municipalities and {localities} localities, as of {month}. One tab per level — search or sort any table; each name opens that area\u2019s own page. Azorean areas show a count but no growth or rank',
    pt: '{regions} distritos, {municipalities} municípios e {localities} freguesias, em {month}. Um separador por nível — pesquise ou ordene qualquer tabela; cada nome abre a página dessa área. As áreas dos Açores mostram contagem mas não crescimento nem posição',
  }),
  'areas.tab_level': entry({ en: 'Administrative level', pt: 'Nível administrativo' }),
  'areas.tab_regions': entry({ en: 'Districts ({n})', pt: 'Distritos ({n})' }),
  'areas.tab_municipalities': entry({ en: 'Municipalities ({n})', pt: 'Municípios ({n})' }),
  'areas.tab_localities': entry({ en: 'Localities ({n})', pt: 'Freguesias ({n})' }),
  'areas.caption_regions': entry({ en: '{n} districts', pt: '{n} distritos' }),
  'areas.caption_municipalities': entry({ en: '{n} municipalities', pt: '{n} municípios' }),
  'areas.caption_localities': entry({ en: '{n} localities', pt: '{n} freguesias' }),

  // --------------------------------------------------------- the Azores note
  'azores.mark_label': entry({
    en: 'Footnote: why the Azores are not in this figure',
    pt: 'Nota: porque é que os Açores não estão neste número',
  }),
  'azores.lead': entry({
    en: 'The Azores are counted, but never charted.',
    pt: 'Os Açores são contados, mas nunca representados em gráficos.',
  }),
  'azores.p1': entry({
    en: 'Tourism is a regional competence there, so Azorean operators register with the Direção Regional do Turismo rather than with the national register this site is built on — which holds {rnal} Azorean establishments against the {rral} on the regional one. This site reads the regional register directly, so the {localities} Azorean localities and {municipalities} municipalities appear in the tables and on the map with their real counts.',
    pt: 'O turismo é uma competência regional, pelo que os operadores açorianos se registam na Direção Regional do Turismo e não no registo nacional em que este site assenta — que tem {rnal} estabelecimentos açorianos contra os {rral} do registo regional. Este site lê o registo regional diretamente, pelo que as {localities} freguesias e os {municipalities} municípios dos Açores aparecem nas tabelas e no mapa com as contagens reais.',
  }),
  'azores.p2_a': entry({ en: 'That register records', pt: 'Esse registo não regista' }),
  'azores.p2_strong': entry({ en: 'no registration dates', pt: 'quaisquer datas de registo' }),
  'azores.p2_b': entry({
    en: '— not stale dates, no date column at all. So there is nothing to plot a month against: no growth line, no monthly total, no growth percentage, and no rank, since every rank here is computed within the monthly series. Those are shown as',
    pt: '— não são datas desatualizadas, não há sequer coluna de datas. Não há portanto nada contra que representar um mês: sem linha de crescimento, sem total mensal, sem percentagem de crescimento e sem posição, já que todas as posições aqui são calculadas dentro da série mensal. Esses valores aparecem como',
  }),
  'azores.p2_c': entry({
    en: 'rather than as zero, because zero would be a claim and this is an absence. Each pull is kept, so a series will accumulate from here forward.',
    pt: 'e não como zero, porque zero seria uma afirmação e isto é uma ausência. Cada recolha é guardada, pelo que a série se vai acumulando daqui para a frente.',
  }),

  // ---------------------------------------------------------------- room mix
  'rooms.caption_national': entry({
    en: 'Share of registrations by number of rooms, on the national register. The Azores are shown separately, on their own pages.',
    pt: 'Proporção de registos por número de quartos, no registo nacional. Os Açores são apresentados à parte, nas suas próprias páginas.',
  }),
  'rooms.caption_area': entry({
    en: 'Room mix in {name}, against the levels above it.',
    pt: 'Distribuição de quartos em {name}, face aos níveis acima.',
  }),

  // ------------------------------------------------------------------ islands
  'mix.share_toggle': entry({
    en: 'Show as share of the total',
    pt: 'Mostrar como proporção do total',
  }),
  'mix.aria': entry({
    en: 'Registrations by subarea, {mode}',
    pt: 'Registos por subárea, {mode}',
  }),
  'mix.mode_share': entry({ en: 'as a share of the total', pt: 'como proporção do total' }),
  'mix.mode_absolute': entry({ en: 'absolute', pt: 'em valor absoluto' }),
  'mix.other': entry({ en: 'Other ({n})', pt: 'Outras ({n})' }),

  'growth.since': entry({ en: 'Compare growth since', pt: 'Comparar crescimento desde' }),
  'growth.slider_label': entry({
    en: 'Base month for the growth comparison',
    pt: 'Mês de referência para a comparação de crescimento',
  }),
  'growth.tabs': entry({ en: 'Growth comparison', pt: 'Comparação de crescimento' }),
  'growth.tab_context': entry({ en: 'This area in context', pt: 'Esta área em contexto' }),
  'growth.tab_subareas': entry({ en: 'Its {n} subareas', pt: 'As suas {n} subáreas' }),
  'growth.aria': entry({
    en: 'Growth of {n} areas since {month}, where 100% is that month',
    pt: 'Crescimento de {n} áreas desde {month}, em que 100% é esse mês',
  }),

  'ts.aria': entry({
    en: '{line} and {bars} by month',
    pt: '{line} e {bars} por mês',
  }),

  'map.metric_rank': entry({ en: 'Rank by ALs', pt: 'Posição por AL' }),
  'map.metric_count': entry({ en: 'Number of ALs', pt: 'Número de AL' }),
  'map.metric_ppa': entry({ en: 'Residents per AL', pt: 'Residentes por AL' }),
  'map.hint_rank': entry({
    en: 'stronger colour = higher up the national ranking',
    pt: 'cor mais forte = mais acima na classificação nacional',
  }),
  'map.hint_count': entry({
    en: 'stronger colour = more registrations',
    pt: 'cor mais forte = mais registos',
  }),
  'map.hint_ppa': entry({
    en: 'stronger colour = denser (fewer residents per registration)',
    pt: 'cor mais forte = mais denso (menos residentes por registo)',
  }),
  'map.lo_rank': entry({ en: 'lowest ranked', pt: 'pior classificada' }),
  'map.hi_rank': entry({ en: 'rank 1', pt: '1.º lugar' }),
  'map.lo_count': entry({ en: 'fewest', pt: 'menos' }),
  'map.hi_count': entry({ en: 'most', pt: 'mais' }),
  'map.lo_ppa': entry({ en: 'least dense', pt: 'menos denso' }),
  'map.hi_ppa': entry({ en: 'densest', pt: 'mais denso' }),
  'map.missing_rank': entry({ en: 'not ranked (Azores)', pt: 'sem posição (Açores)' }),
  'map.missing_pop': entry({ en: 'no population figure', pt: 'sem dados de população' }),
  'map.colour_by': entry({ en: 'Colour the map by', pt: 'Colorir o mapa por' }),
  'map.jump_to': entry({ en: 'Jump to', pt: 'Ir para' }),
  'map.mainland': entry({ en: 'Mainland', pt: 'Continente' }),
  'map.madeira': entry({ en: 'Madeira', pt: 'Madeira' }),
  'map.azores': entry({ en: 'Azores', pt: 'Açores' }),
  'map.aria': entry({
    en: 'Map of Portuguese localities by registered short-lets',
    pt: 'Mapa das freguesias portuguesas por alojamentos locais registados',
  }),
  'map.loading': entry({ en: 'Loading the map…', pt: 'A carregar o mapa…' }),
  'map.failed': entry({
    en: 'The map could not load ({err}). Every locality is still listed on the',
    pt: 'Não foi possível carregar o mapa ({err}). Todas as freguesias continuam listadas no',
  }),
  'map.failed_link': entry({ en: 'areas index', pt: 'índice de áreas' }),
  'map.registered': entry({ en: 'Registered ALs', pt: 'AL registados' }),
  'map.rank_in_pt': entry({ en: 'Rank in Portugal', pt: 'Posição em Portugal' }),
  'map.not_ranked': entry({ en: 'not ranked', pt: 'sem posição' }),
  'map.residents': entry({ en: 'Residents per AL', pt: 'Residentes por AL' }),
  'map.population': entry({ en: 'Population', pt: 'População' }),
  'map.open': entry({ en: 'Open {name} →', pt: 'Abrir {name} →' }),

  // ------------------------------------------------------------- home page
  'home.title': entry({
    en: 'Portugal Alojamento Local — the short-let register, month by month',
    pt: 'Alojamento Local em Portugal — o registo, mês a mês',
  }),
  'home.description': entry({
    en: 'Every registered Alojamento Local in mainland Portugal and Madeira, {from} to {to}.',
    pt: 'Todos os Alojamentos Locais registados em Portugal continental e na Madeira, de {from} a {to}.',
  }),
  'home.h1': entry({ en: 'Portugal\u2019s short-let register', pt: 'O registo de Alojamento Local' }),
  'home.lede': entry({
    en: 'Every Alojamento Local on the national register, by locality, month by month from {from} to {to}.',
    pt: 'Todos os Alojamentos Locais do registo nacional, por freguesia, mês a mês de {from} a {to}.',
  }),
  'home.lede_shrinking': entry({
    en: 'The register is no longer growing: at the last count before the decline it stood at {peak} in {peakMonth}, and it now holds {total} — {pct} fewer.',
    pt: 'O registo já não está a crescer: na última contagem antes da queda tinha {peak} em {peakMonth} e hoje tem {total} — menos {pct}.',
  }),
  'home.lede_growing': entry({
    en: 'It now holds {total} active registrations.',
    pt: 'Tem atualmente {total} registos ativos.',
  }),

  'home.g_register': entry({ en: 'The register', pt: 'O registo' }),
  'home.g_leaving': entry({ en: 'Licences leaving', pt: 'Licenças que saem' }),
  'home.g_concentrated': entry({ en: 'How concentrated', pt: 'Quão concentrado' }),

  'home.m_registered': entry({ en: 'Registered short-lets', pt: 'Alojamentos locais registados' }),
  'home.m_registered_note': entry({
    en: 'Mainland Portugal and Madeira, on the national register.',
    pt: 'Portugal continental e Madeira, no registo nacional.',
  }),
  'home.m_over_three': entry({ en: 'over three years', pt: 'em três anos' }),
  'home.m_azores': entry({ en: 'Azores, separate register', pt: 'Açores, registo separado' }),
  'home.m_azores_note': entry({
    en: '{municipalities} municipalities and {localities} localities. Counted here and on the map; absent from every chart.',
    pt: '{municipalities} municípios e {localities} freguesias. Contados aqui e no mapa; ausentes de todos os gráficos.',
  }),
  'home.m_lost_month': entry({ en: 'Lost last month', pt: 'Perdidos no último mês' }),
  'home.m_lost_month_note': entry({ en: '{month} alone', pt: 'só em {month}' }),
  'home.m_lost_ytd': entry({ en: 'Lost year to date', pt: 'Perdidos no ano até à data' }),
  'home.m_lost_ytd_note': entry({
    en: 'Against {n} in all of {year}',
    pt: 'Contra {n} em todo o ano de {year}',
  }),
  'home.m_half': entry({
    en: 'Localities holding half the ALs',
    pt: 'Freguesias com metade dos AL',
  }),
  'home.m_half_note': entry({
    en: '{rank} of {total} localities hold 50% of every registration on the national register',
    pt: '{rank} de {total} freguesias concentram 50% de todos os registos do registo nacional',
  }),
  'home.m_pop': entry({ en: 'Population living there', pt: 'População aí residente' }),
  'home.m_pop_note': entry({
    en: 'Share of Portugal\u2019s population in those same localities',
    pt: 'Proporção da população portuguesa nessas mesmas freguesias',
  }),

  'home.h_registrations': entry({
    en: 'Registrations, and what stopped them',
    pt: 'Registos, e o que os travou',
  }),
  'home.p_registrations': entry({
    en: 'The line is the running total; the bars are registrations added each month. Numbered dashed rules mark the changes to the law, listed under the chart. Mainland Portugal and Madeira only',
    pt: 'A linha é o total acumulado; as barras são os registos acrescentados em cada mês. As linhas tracejadas numeradas marcam as alterações à lei, listadas por baixo do gráfico. Apenas Portugal continental e Madeira',
  }),

  'home.h_leaving': entry({
    en: 'Licences leaving the register',
    pt: 'Licenças que saem do registo',
  }),
  'home.p_leaving': entry({
    en: 'A licence is only visible as lost between two consecutive pulls of the register, so this chart starts at {from} — the first month there were two pulls to compare. It is not that nothing lapsed before then; it is that nothing could be seen to.',
    pt: 'Uma licença só é visível como perdida entre duas recolhas consecutivas do registo, pelo que este gráfico começa em {from} — o primeiro mês com duas recolhas para comparar. Não é que nada tenha caducado antes disso; é que nada o podia demonstrar.',
  }),
  'home.p_gap': entry({
    en: 'The register was not pulled between {from} and {to}, so those months are blank rather than zero, and every loss found in that stretch is attributed to {at}.',
    pt: 'O registo não foi recolhido entre {from} e {to}, pelo que esses meses ficam em branco e não a zero, e todas as perdas encontradas nesse intervalo são atribuídas a {at}.',
  }),
  'home.cap_pulls': entry({
    en: '{n} pulls of the register so far, the first in {first}.',
    pt: '{n} recolhas do registo até agora, a primeira em {first}.',
  }),

  'home.h_districts': entry({
    en: 'Districts and autonomous regions',
    pt: 'Distritos e regiões autónomas',
  }),
  'home.p_districts': entry({
    en: 'The Azores are listed with their current count; their growth and rank columns are empty because their register carries no dates',
    pt: 'Os Açores aparecem com a contagem atual; as colunas de crescimento e posição ficam vazias porque o seu registo não tem datas',
  }),
  'home.cap_districts': entry({
    en: 'Sort by any column. Bars share one scale per column across every row, so lengths keep comparing when you search.',
    pt: 'Ordene por qualquer coluna. As barras partilham uma escala por coluna em todas as linhas, para que os comprimentos continuem comparáveis durante a pesquisa.',
  }),
  'home.h_sizes': entry({ en: 'What size are they?', pt: 'De que tamanho são?' }),

  // ------------------------------------------------------------- area page
  'area.title': entry({ en: '{name} — Alojamento Local', pt: '{name} — Alojamento Local' }),
  'area.description': entry({
    en: '{n} registered short-lets in {name}, {month}.',
    pt: '{n} alojamentos locais registados em {name}, {month}.',
  }),
  'area.breadcrumb': entry({ en: 'Breadcrumb', pt: 'Percurso' }),
  'area.back_overview': entry({ en: 'Overview', pt: 'Visão geral' }),
  'area.lede_shrinking': entry({
    en: '{n} registered short-lets, {pct} fewer than at the last count before the decline ({peak} in {peakMonth}).',
    pt: '{n} alojamentos locais registados, menos {pct} do que na última contagem antes da queda ({peak} em {peakMonth}).',
  }),
  'area.lede': entry({
    en: '{n} registered short-lets as of {month}.',
    pt: '{n} alojamentos locais registados em {month}.',
  }),
  'area.population': entry({ en: 'Population {n}.', pt: 'População {n}.' }),
  'area.headline': entry({ en: 'Headline figures', pt: 'Números principais' }),

  'area.g_size': entry({ en: 'Size', pt: 'Dimensão' }),
  'area.g_rank': entry({ en: 'Where it ranks', pt: 'Onde se posiciona' }),
  'area.g_conc': entry({ en: 'How concentrated', pt: 'Quão concentrado' }),
  'area.m_registered': entry({ en: 'Registered short-lets', pt: 'Alojamentos locais registados' }),
  'area.m_inhab': entry({ en: 'Inhabitants per short-let', pt: 'Habitantes por alojamento local' }),
  'area.m_inhab_note': entry({
    en: 'Lower means denser: fewer residents for each registered let.',
    pt: 'Menos significa mais denso: menos residentes por cada alojamento registado.',
  }),
  'area.over_three': entry({ en: 'over three years', pt: 'em três anos' }),
  'area.not_ranked': entry({
    en: 'Not ranked: every rank here is computed inside the monthly series, and this area has none',
    pt: 'Sem posição: todas as posições aqui são calculadas dentro da série mensal, e esta área não tem série',
  }),
  'area.rank_country': entry({ en: 'In Portugal', pt: 'Em Portugal' }),
  'area.rank_district': entry({ en: 'In its district', pt: 'No seu distrito' }),
  'area.rank_municipality': entry({ en: 'In its municipality', pt: 'No seu município' }),
  'area.rank_of': entry({ en: 'of {n} {level}', pt: 'de {n} {level}' }),
  'area.m_half': entry({
    en: 'Localities holding half its ALs',
    pt: 'Freguesias com metade dos seus AL',
  }),
  'area.m_half_note': entry({
    en: '{n} localities hold 50% of everything registered here',
    pt: '{n} freguesias concentram 50% de tudo o que está aqui registado',
  }),
  'area.m_pop': entry({ en: 'Population living there', pt: 'População aí residente' }),
  'area.m_pop_note': entry({
    en: 'Share of this area\u2019s population in those same localities',
    pt: 'Proporção da população desta área nessas mesmas freguesias',
  }),

  'area.h_nohistory': entry({ en: 'No history for this area', pt: 'Sem histórico para esta área' }),
  'area.p_nohistory': entry({
    en: 'Everything above is this month\u2019s count. There is no chart on this page because there is nothing to plot it against — and that is a fact about the register, not a gap in this site.',
    pt: 'Tudo o que está acima é a contagem deste mês. Não há gráfico nesta página porque não há nada contra que o representar — e isso é um facto sobre o registo, não uma lacuna deste site.',
  }),

  'area.h_over_time': entry({ en: 'Registrations over time', pt: 'Registos ao longo do tempo' }),
  'area.cap_over_time': entry({
    en: 'The line is the running total; bars are registrations added each month. The numbered dashed rules mark changes to the national law.',
    pt: 'A linha é o total acumulado; as barras são os registos acrescentados em cada mês. As linhas tracejadas numeradas marcam alterações à lei nacional.',
  }),
  'area.h_leaving': entry({ en: 'Licences leaving the register', pt: 'Licenças que saem do registo' }),
  'area.lost_aria': entry({ en: 'Lost licences', pt: 'Licenças perdidas' }),
  'area.cap_losses': entry({
    en: 'Losses are only visible between two pulls of the register, so this starts at {from}. The gap with no pull is left blank rather than drawn as zero.',
    pt: 'As perdas só são visíveis entre duas recolhas do registo, pelo que isto começa em {from}. O intervalo sem recolha fica em branco em vez de ser desenhado a zero.',
  }),
  'area.no_losses': entry({
    en: 'No registration here has been seen to leave the register since {from}, which is as far back as losses can be detected.',
    pt: 'Nenhum registo desta área foi visto a sair do registo desde {from}, que é o mais longe que é possível detetar perdas.',
  }),
  'area.h_growth': entry({
    en: 'Growth, against a month you choose',
    pt: 'Crescimento, face a um mês à sua escolha',
  }),
  'area.p_growth': entry({
    en: 'Every line starts at 100% in the base month, so they compare regardless of size. Drag the slider to move the base.',
    pt: 'Todas as linhas começam a 100% no mês de referência, pelo que são comparáveis independentemente da dimensão. Arraste o cursor para mudar a referência.',
  }),
  'area.h_splits': entry({ en: 'How the total splits', pt: 'Como o total se reparte' }),
  'area.cap_splits': entry({
    en: 'Absolute totals show growth; the share view shows which subareas gained ground, which growth alone hides.',
    pt: 'Os totais absolutos mostram o crescimento; a vista de proporção mostra que subáreas ganharam terreno, o que o crescimento por si só esconde.',
  }),
  'area.lists_label': entry({
    en: 'Areas within this district',
    pt: 'Áreas dentro deste distrito',
  }),
  'area.every_locality': entry({
    en: 'Every locality in {name} — {n}',
    pt: 'Todas as freguesias de {name} — {n}',
  }),
  'area.h_municipalities': entry({ en: 'Municipalities', pt: 'Municípios' }),
  'area.h_localities': entry({ en: 'Localities', pt: 'Freguesias' }),
  'area.h_sizes': entry({ en: 'What size are they?', pt: 'De que tamanho são?' }),
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof DICT;

/** Look up a string, filling `{placeholders}` from `vars`.
 *
 * An unknown placeholder is left in place rather than blanked: a visible
 * `{month}` on the page is a bug report, an empty gap is a mystery.
 */
export function t(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICT[key][lang];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** A `t` bound to one language, for passing into a component. */
export function translator(lang: Lang) {
  return (key: Key, vars?: Record<string, string | number>) => t(lang, key, vars);
}

/** The path a page has in a given language.
 *
 * `/areas/faro` in English is `/pt/areas/faro` in Portuguese. Used by the
 * language switcher and by the `hreflang` links, so the two can never disagree
 * about where a translation lives.
 */
export function localePath(lang: Lang, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return lang === DEFAULT_LANG ? clean : `/${lang}${clean}`;
}

/** The site base with the language prefix on it.
 *
 * Islands build their own links (`${base}/areas/${slug}`), so they must be
 * handed a base that already carries the language — otherwise every link out
 * of a Portuguese table lands on the English page and the reader silently
 * falls out of their language halfway through a session.
 *
 * Not to be used for assets: the geometry and the favicon are shared, and
 * `/pt/geo/localities.json` does not exist.
 */
export function langBase(base: string, lang: Lang): string {
  return lang === DEFAULT_LANG ? base : `${base}/${lang}`;
}

/** The language a built path belongs to, and the path without its prefix. */
export function splitLocale(path: string): { lang: Lang; rest: string } {
  for (const lang of LANGS) {
    if (lang === DEFAULT_LANG) continue;
    if (path === `/${lang}` || path.startsWith(`/${lang}/`)) {
      return { lang, rest: path.slice(lang.length + 1) || '/' };
    }
  }
  return { lang: DEFAULT_LANG, rest: path || '/' };
}

/** Label for an administrative level, singular or plural. */
export function levelLabel(
  lang: Lang,
  type: 'region' | 'municipality' | 'locality',
  plural = false
): string {
  return t(lang, (plural ? `level.${type}.plural` : `level.${type}`) as Key);
}

/** Label for a room-size bucket, given the mart's English value. */
export function roomLabel(lang: Lang, metricName: string): string {
  const map: Record<string, Key> = {
    '0 rooms': 'rooms.0',
    '1 room': 'rooms.1',
    '2 rooms': 'rooms.2',
    '3 rooms': 'rooms.3',
    'More than 3 rooms': 'rooms.more',
  };
  const key = map[metricName];
  return key ? t(lang, key) : metricName;
}

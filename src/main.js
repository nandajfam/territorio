import "./style.css";
import { supabase, supabaseConfigurado, TABELA, CAMPOS } from "./supabase.js";

/* ------------------------------------------------------------------ */
/* Estado da aplicação                                                 */
/* ------------------------------------------------------------------ */

const CHAVE_REGIAO = "controle-visitas:regiao";
const PERIODOS = [
  { campo: "visita_manha", rotulo: "Manhã" },
  { campo: "visita_tarde", rotulo: "Tarde" },
  { campo: "visita_noite", rotulo: "Noite" },
];

const estado = {
  enderecos: [],
  carregando: true,
  erro: null,
  regiao: localStorage.getItem(CHAVE_REGIAO) || "Todos",
  status: "todos",
  abertos: new Set(),
  salvando: new Set(),
};

const el = {
  resumo: document.getElementById("resumo"),
  regioes: document.getElementById("regioes"),
  status: document.getElementById("status"),
  lista: document.getElementById("lista"),
  avisos: document.getElementById("avisos"),
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const esc = (valor) =>
  String(valor ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

function rotuloEstrangeiro(valor) {
  if (valor === true) return "Tem estrangeiro";
  if (valor === false) return "Não tem estrangeiro";
  return "Sem resposta";
}

function classesStatus(valor) {
  if (valor === true) return "bg-verde text-white";
  if (valor === false) return "bg-vermelho text-white";
  return "bg-white text-oceano ring-1 ring-mar";
}

/* ------------------------------------------------------------------ */
/* Mensagens de sucesso e erro                                         */
/* ------------------------------------------------------------------ */

function avisar(mensagem, tipo = "sucesso") {
  const cor = tipo === "erro" ? "bg-marinho" : "bg-oceano";
  const aviso = document.createElement("div");
  aviso.className = `pointer-events-auto max-w-sm rounded-xl ${cor} px-4 py-3 text-sm font-medium text-creme shadow-lg`;
  aviso.textContent = mensagem;
  el.avisos.appendChild(aviso);
  setTimeout(() => aviso.remove(), 4000);
}

/* ------------------------------------------------------------------ */
/* Consulta ao Supabase                                                */
/* ------------------------------------------------------------------ */

async function carregarEnderecos() {
  estado.carregando = true;
  estado.erro = null;
  renderizar();

  if (!supabaseConfigurado) {
    estado.carregando = false;
    estado.erro =
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para carregar os endereços.";
    renderizar();
    return;
  }

  const { data, error } = await supabase
    .from(TABELA)
    .select(CAMPOS)
    .order("territorio", { ascending: true })
    .order("cidade", { ascending: true })
    .order("endereco", { ascending: true });

  estado.carregando = false;

  if (error) {
    estado.erro =
      "Não foi possível carregar os endereços. Verifique sua conexão e tente novamente.";
    console.error(error);
  } else {
    estado.enderecos = data ?? [];
  }

  renderizar();
}

async function atualizarEndereco(id, campos) {
  const payload = { ...campos, atualizado_em: new Date().toISOString() };

  const { data, error } = await supabase
    .from(TABELA)
    .update(payload)
    .eq("id", id)
    .select(CAMPOS)
    .single();

  if (error) throw error;

  const indice = estado.enderecos.findIndex((item) => item.id === id);
  if (indice >= 0) estado.enderecos[indice] = data;
  return data;
}

/* ------------------------------------------------------------------ */
/* Filtragem e ordenação                                               */
/* ------------------------------------------------------------------ */

function regioesDisponiveis() {
  const nomes = [
    ...new Set(estado.enderecos.map((item) => item.regiao).filter(Boolean)),
  ];
  nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return ["Todos", ...nomes];
}

function combinaStatus(item) {
  switch (estado.status) {
    case "sem_resposta":
      return item.tem_estrangeiro === null || item.tem_estrangeiro === undefined;
    case "tem":
      return item.tem_estrangeiro === true;
    case "nao_tem":
      return item.tem_estrangeiro === false;
    default:
      return true;
  }
}

function ordenar(lista) {
  return [...lista].sort(
    (a, b) =>
      a.territorio.localeCompare(b.territorio, "pt-BR") ||
      a.cidade.localeCompare(b.cidade, "pt-BR") ||
      a.endereco.localeCompare(b.endereco, "pt-BR"),
  );
}

function daRegiaoSelecionada(item) {
  return estado.regiao === "Todos" || item.regiao === estado.regiao;
}

function enderecosVisiveis() {
  return ordenar(
    estado.enderecos.filter((item) => daRegiaoSelecionada(item) && combinaStatus(item)),
  );
}

/* ------------------------------------------------------------------ */
/* Indicadores (resumo)                                                */
/* ------------------------------------------------------------------ */

function calcularResumo() {
  const base = estado.enderecos.filter(daRegiaoSelecionada);
  return [
    { rotulo: "Total", valor: base.length },
    {
      rotulo: "Sem resposta",
      valor: base.filter(
        (i) => i.tem_estrangeiro === null || i.tem_estrangeiro === undefined,
      ).length,
    },
    {
      rotulo: "Tem estrangeiro",
      valor: base.filter((i) => i.tem_estrangeiro === true).length,
      cor: "text-verde",
    },
    {
      rotulo: "Não tem",
      valor: base.filter((i) => i.tem_estrangeiro === false).length,
      cor: "text-vermelho",
    },
  ];
}

function renderizarResumo() {
  el.resumo.innerHTML = calcularResumo()
    .map(
      (item) => `
      <li class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-mar/30">
        <p class="text-xs font-semibold text-oceano">${esc(item.rotulo)}</p>
        <p class="text-xl font-bold ${item.cor ?? "text-marinho"}">${item.valor}</p>
      </li>`,
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* Menu de regiões                                                     */
/* ------------------------------------------------------------------ */

function renderizarRegioes() {
  const nomes = regioesDisponiveis();
  if (estado.enderecos.length > 0 && !nomes.includes(estado.regiao)) {
    estado.regiao = "Todos";
    localStorage.setItem(CHAVE_REGIAO, estado.regiao);
  }

  el.regioes.innerHTML = nomes
    .map((nome) => {
      const ativo = nome === estado.regiao;
      const cor = ativo
        ? "bg-oceano text-creme border-oceano"
        : "bg-white text-oceano border-mar";
      return `
        <button
          type="button"
          data-regiao="${esc(nome)}"
          aria-pressed="${ativo}"
          class="shrink-0 rounded-full border ${cor} px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-marinho"
        >${esc(nome)}</button>`;
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/* Cartões de endereço                                                 */
/* ------------------------------------------------------------------ */

function botaoResposta(item, valor) {
  const selecionado = item.tem_estrangeiro === valor;
  const base =
    "flex-1 rounded-xl border px-3 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-marinho disabled:opacity-60";
  const cor = valor
    ? selecionado
      ? "bg-verde text-white border-verde"
      : "bg-white text-verde border-verde"
    : selecionado
      ? "bg-vermelho text-white border-vermelho"
      : "bg-white text-vermelho border-vermelho";
  const rotulo = valor ? "Tem estrangeiro" : "Não tem estrangeiro";
  return `
    <button
      type="button"
      data-acao="${valor ? "tem" : "nao-tem"}"
      data-id="${item.id}"
      aria-pressed="${selecionado}"
      aria-label="${rotulo}${selecionado ? " (clique para desmarcar)" : ""}"
      class="${base} ${cor}"
    >${selecionado ? "✓ " : ""}${rotulo}</button>`;
}

function periodosVisitados(item) {
  return PERIODOS.filter((periodo) => item[periodo.campo] === true);
}

function botaoPeriodo(item, periodo) {
  const selecionado = item[periodo.campo] === true;
  const cor = selecionado
    ? "bg-oceano text-creme border-oceano"
    : "bg-white text-oceano border-mar";
  return `
    <button
      type="button"
      data-acao="periodo"
      data-campo="${periodo.campo}"
      data-id="${item.id}"
      aria-pressed="${selecionado}"
      aria-label="Visitado de ${esc(periodo.rotulo.toLowerCase())}"
      class="flex-1 rounded-xl border ${cor} px-3 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-marinho disabled:opacity-60"
    >${selecionado ? "✓ " : ""}${esc(periodo.rotulo)}</button>`;
}

function cartao(item) {
  const aberto = estado.abertos.has(item.id);
  const status = rotuloEstrangeiro(item.tem_estrangeiro);

  const selo =
    item.tem_estrangeiro === true
      ? `<span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-verde ring-1 ring-verde">★ Estrangeiro encontrado</span>`
      : item.tem_estrangeiro === false
        ? `<span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-vermelho ring-1 ring-vermelho">✕ Nenhum estrangeiro</span>`
        : "";

  return `
  <article class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-mar/30" data-cartao="${item.id}">
    <p class="text-xs font-semibold uppercase tracking-wide text-mar">
      ${esc(item.regiao ?? "Sem região")} · Território: ${esc(item.territorio)}
    </p>
    <p class="mt-1 text-base font-semibold leading-snug text-marinho">${esc(item.endereco)}</p>
    <p class="text-sm text-oceano">${esc(item.cidade)} - ${esc(item.estado)}</p>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2 py-1 text-xs font-semibold ${classesStatus(item.tem_estrangeiro)}">
        Status: ${esc(status)}
      </span>
      ${selo}
      ${
        item.sem_retorno
          ? `<span class="rounded-full bg-oceano px-2 py-1 text-xs font-semibold text-creme">✓ Sem necessidade de retorno</span>`
          : ""
      }
      ${
        periodosVisitados(item).length > 0
          ? `<span class="rounded-full bg-mar px-2 py-1 text-xs font-semibold text-white">⏱ Visitado: ${esc(
              periodosVisitados(item)
                .map((periodo) => periodo.rotulo)
                .join(", "),
            )}</span>`
          : `<span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-mar ring-1 ring-mar">Nenhum período visitado</span>`
      }
    </div>

    <button
      type="button"
      data-acao="expandir"
      data-id="${item.id}"
      aria-expanded="${aberto}"
      aria-controls="detalhes-${item.id}"
      class="mt-3 w-full rounded-xl border border-mar bg-creme px-4 py-3 text-sm font-semibold text-marinho focus:outline-none focus:ring-2 focus:ring-marinho"
    >${aberto ? "Recolher" : "Expandir"}</button>

    <div id="detalhes-${item.id}" class="detalhes mt-0" data-aberto="${aberto}">
      <div>
        <div class="space-y-3 pt-3">
          <p class="text-sm font-semibold text-marinho">Tem estrangeiro neste endereço?</p>
          <div class="flex gap-2">
            ${botaoResposta(item, true)}
            ${botaoResposta(item, false)}
          </div>

          <p class="text-sm font-semibold text-marinho">
            Qual período da visita? <span class="font-normal text-mar">(marque todos os já tentados)</span>
          </p>
          <div class="flex gap-2">
            ${PERIODOS.map((periodo) => botaoPeriodo(item, periodo)).join("")}
          </div>

          <label class="flex items-start gap-3 rounded-xl border border-mar bg-creme px-4 py-3 text-sm font-semibold text-marinho">
            <input
              type="checkbox"
              data-acao="sem-retorno"
              data-id="${item.id}"
              ${item.sem_retorno ? "checked" : ""}
              class="mt-0.5 h-5 w-5 shrink-0 accent-oceano focus:outline-none focus:ring-2 focus:ring-marinho"
            />
            <span>Não há necessidade de retornar nos outros horários.</span>
          </label>

          <button
            type="button"
            data-acao="maps"
            data-id="${item.id}"
            aria-label="Abrir ${esc(item.endereco)} no Google Maps"
            class="w-full rounded-xl border border-mar px-4 py-3 text-sm font-semibold text-mar focus:outline-none focus:ring-2 focus:ring-marinho"
          >Abrir no Google Maps</button>

          <p class="text-xs text-mar">
            Atualizado em: ${esc(new Date(item.atualizado_em).toLocaleString("pt-BR"))}
          </p>
        </div>
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Renderização da lista                                               */
/* ------------------------------------------------------------------ */

function renderizarLista() {
  if (estado.carregando) {
    el.lista.innerHTML = Array.from({ length: 3 })
      .map(
        () => `
        <div class="animate-pulse rounded-2xl bg-white p-4 shadow-sm ring-1 ring-mar/30">
          <div class="h-3 w-24 rounded bg-mar/30"></div>
          <div class="mt-3 h-4 w-3/4 rounded bg-mar/30"></div>
          <div class="mt-2 h-3 w-1/2 rounded bg-mar/20"></div>
          <div class="mt-4 h-10 w-full rounded bg-creme"></div>
        </div>`,
      )
      .join("")
      .concat(
        `<p class="text-center text-sm font-medium text-oceano">Carregando endereços...</p>`,
      );
    return;
  }

  if (estado.erro) {
    el.lista.innerHTML = `
      <div class="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-marinho">
        <p class="text-sm font-semibold text-marinho">${esc(estado.erro)}</p>
        <button
          type="button"
          data-acao="recarregar"
          class="mt-3 rounded-xl bg-oceano px-4 py-3 text-sm font-semibold text-creme focus:outline-none focus:ring-2 focus:ring-marinho"
        >Tentar novamente</button>
      </div>`;
    return;
  }

  const visiveis = enderecosVisiveis();

  if (visiveis.length === 0) {
    el.lista.innerHTML = `
      <div class="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-mar/30">
        <p class="text-sm text-oceano">
          Nenhum endereço encontrado com os filtros atuais.
        </p>
      </div>`;
    return;
  }

  el.lista.innerHTML = visiveis.map(cartao).join("");
}

function renderizar() {
  renderizarResumo();
  renderizarRegioes();
  renderizarLista();
}

/* ------------------------------------------------------------------ */
/* Ações dos cartões                                                   */
/* ------------------------------------------------------------------ */

function definirCarregando(botao, carregando, textoOriginal) {
  botao.disabled = carregando;
  if (botao.tagName === "INPUT") return;
  botao.textContent = carregando ? "Salvando..." : textoOriginal;
}

async function executarAtualizacao(botao, id, campos, mensagem) {
  if (estado.salvando.has(id)) return;
  estado.salvando.add(id);
  const texto = botao.textContent;
  definirCarregando(botao, true, texto);

  try {
    await atualizarEndereco(id, campos);
    avisar(mensagem);
    renderizar();
  } catch (erro) {
    console.error(erro);
    definirCarregando(botao, false, texto);
    avisar("Não foi possível salvar. Tente novamente.", "erro");
  } finally {
    estado.salvando.delete(id);
  }
}

function abrirMaps(item) {
  const consulta = `${item.endereco}, ${item.cidade} - ${item.estado}`;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function alternarCartao(id, botao) {
  const aberto = !estado.abertos.has(id);
  if (aberto) estado.abertos.add(id);
  else estado.abertos.delete(id);

  // Alterna no DOM existente para que a transição CSS aconteça.
  const detalhes = document.getElementById(`detalhes-${id}`);
  if (detalhes) detalhes.dataset.aberto = String(aberto);
  botao.setAttribute("aria-expanded", String(aberto));
  botao.textContent = aberto ? "Recolher" : "Expandir";
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

el.status.addEventListener("change", (evento) => {
  estado.status = evento.target.value;
  renderizarLista();
});

el.regioes.addEventListener("click", (evento) => {
  const botao = evento.target.closest("button[data-regiao]");
  if (!botao) return;
  estado.regiao = botao.dataset.regiao;
  localStorage.setItem(CHAVE_REGIAO, estado.regiao);
  renderizar();
});

el.lista.addEventListener("click", (evento) => {
  const botao = evento.target.closest("[data-acao]");
  if (!botao) return;

  const acao = botao.dataset.acao;
  if (acao === "recarregar") {
    carregarEnderecos();
    return;
  }

  const id = Number(botao.dataset.id);
  const item = estado.enderecos.find((registro) => registro.id === id);
  if (!item) return;

  switch (acao) {
    case "expandir":
      alternarCartao(id, botao);
      break;
    case "tem":
    case "nao-tem": {
      const valor = acao === "tem";
      const novo = item.tem_estrangeiro === valor ? null : valor;
      executarAtualizacao(
        botao,
        id,
        { tem_estrangeiro: novo },
        novo === null ? "Resposta removida." : "Resposta salva.",
      );
      break;
    }
    case "sem-retorno": {
      const marcado = item.sem_retorno !== true;
      executarAtualizacao(
        botao,
        id,
        { sem_retorno: marcado },
        marcado
          ? "Marcado: sem necessidade de retorno."
          : "Desmarcado: retorno necessário.",
      );
      break;
    }
    case "periodo": {
      const campo = botao.dataset.campo;
      const periodo = PERIODOS.find((opcao) => opcao.campo === campo);
      const marcado = item[campo] !== true;
      executarAtualizacao(
        botao,
        id,
        { [campo]: marcado },
        marcado
          ? `${periodo.rotulo}: visitado.`
          : `${periodo.rotulo}: desmarcado.`,
      );
      break;
    }
    case "maps":
      abrirMaps(item);
      break;
  }
});

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

el.status.value = estado.status;
carregarEnderecos();

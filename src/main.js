import "./style.css";
import { supabase, supabaseConfigurado, TABELA, CAMPOS } from "./supabase.js";

/* ------------------------------------------------------------------ */
/* Estado da aplicação                                                 */
/* ------------------------------------------------------------------ */

const CHAVE_TERRITORIO = "controle-visitas:territorio";

const estado = {
  enderecos: [],
  carregando: true,
  erro: null,
  busca: "",
  territorio: localStorage.getItem(CHAVE_TERRITORIO) || "Todos",
  status: "todos",
  abertos: new Set(),
  salvando: new Set(),
};

const el = {
  resumo: document.getElementById("resumo"),
  busca: document.getElementById("busca"),
  territorios: document.getElementById("territorios"),
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

const normalizar = (valor) =>
  String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function rotuloEstrangeiro(valor) {
  if (valor === true) return "Tem estrangeiro";
  if (valor === false) return "Não tem estrangeiro";
  return "Sem resposta";
}

function classesStatus(valor) {
  if (valor === true) return "bg-green-100 text-green-900 ring-1 ring-green-600";
  if (valor === false) return "bg-red-100 text-red-900 ring-1 ring-red-600";
  return "bg-amber-100 text-amber-900 ring-1 ring-amber-600";
}

/* ------------------------------------------------------------------ */
/* Mensagens de sucesso e erro                                         */
/* ------------------------------------------------------------------ */

function avisar(mensagem, tipo = "sucesso") {
  const cor =
    tipo === "erro" ? "bg-red-700" : tipo === "info" ? "bg-slate-800" : "bg-green-700";
  const aviso = document.createElement("div");
  aviso.className = `pointer-events-auto max-w-sm rounded-xl ${cor} px-4 py-3 text-sm font-medium text-white shadow-lg`;
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

function territoriosDisponiveis() {
  const nomes = [...new Set(estado.enderecos.map((item) => item.territorio))];
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
    case "concluida":
      return item.visita_concluida === true;
    default:
      return true;
  }
}

function combinaBusca(item) {
  const termo = normalizar(estado.busca).trim();
  if (!termo) return true;
  const alvo = normalizar(
    [item.territorio, item.endereco, item.cidade, item.estado].join(" "),
  );
  return termo.split(/\s+/).every((parte) => alvo.includes(parte));
}

function ordenar(lista) {
  return [...lista].sort(
    (a, b) =>
      a.territorio.localeCompare(b.territorio, "pt-BR") ||
      a.cidade.localeCompare(b.cidade, "pt-BR") ||
      a.endereco.localeCompare(b.endereco, "pt-BR"),
  );
}

function enderecosVisiveis() {
  const filtrados = estado.enderecos.filter(
    (item) =>
      (estado.territorio === "Todos" || item.territorio === estado.territorio) &&
      combinaStatus(item) &&
      combinaBusca(item),
  );
  return ordenar(filtrados);
}

/* ------------------------------------------------------------------ */
/* Indicadores (resumo)                                                */
/* ------------------------------------------------------------------ */

function calcularResumo() {
  const base = estado.enderecos.filter(
    (item) => estado.territorio === "Todos" || item.territorio === estado.territorio,
  );
  return [
    { rotulo: "Total", valor: base.length, cor: "text-slate-900" },
    {
      rotulo: "Sem resposta",
      valor: base.filter((i) => i.tem_estrangeiro === null || i.tem_estrangeiro === undefined)
        .length,
      cor: "text-amber-700",
    },
    {
      rotulo: "Tem estrangeiro",
      valor: base.filter((i) => i.tem_estrangeiro === true).length,
      cor: "text-green-700",
    },
    {
      rotulo: "Não tem",
      valor: base.filter((i) => i.tem_estrangeiro === false).length,
      cor: "text-red-700",
    },
    {
      rotulo: "Visitas concluídas",
      valor: base.filter((i) => i.visita_concluida === true).length,
      cor: "text-blue-700",
    },
  ];
}

function renderizarResumo() {
  el.resumo.innerHTML = calcularResumo()
    .map(
      (item) => `
      <li class="rounded-xl bg-white p-3 shadow-sm">
        <p class="text-xs font-medium text-slate-600">${esc(item.rotulo)}</p>
        <p class="text-xl font-bold ${item.cor}">${item.valor}</p>
      </li>`,
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* Menu de territórios                                                 */
/* ------------------------------------------------------------------ */

function renderizarTerritorios() {
  const nomes = territoriosDisponiveis();
  if (!nomes.includes(estado.territorio)) estado.territorio = "Todos";

  el.territorios.innerHTML = nomes
    .map((nome) => {
      const ativo = nome === estado.territorio;
      const cor = ativo
        ? "bg-blue-700 text-white border-blue-700"
        : "bg-white text-slate-700 border-slate-300";
      return `
        <button
          type="button"
          data-territorio="${esc(nome)}"
          aria-pressed="${ativo}"
          class="shrink-0 rounded-full border ${cor} px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
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
    "flex-1 rounded-xl border px-3 py-3 text-sm font-semibold focus:outline-none focus:ring-2 disabled:opacity-60";
  const cor = valor
    ? selecionado
      ? "bg-green-700 text-white border-green-700 focus:ring-green-700"
      : "bg-white text-green-800 border-green-700 focus:ring-green-700"
    : selecionado
      ? "bg-red-700 text-white border-red-700 focus:ring-red-700"
      : "bg-white text-red-800 border-red-700 focus:ring-red-700";
  const rotulo = valor ? "Tem estrangeiro" : "Não tem estrangeiro";
  return `
    <button
      type="button"
      data-acao="${valor ? "tem" : "nao-tem"}"
      data-id="${item.id}"
      aria-pressed="${selecionado}"
      class="${base} ${cor}"
    >${selecionado ? "✓ " : ""}${rotulo}</button>`;
}

function cartao(item) {
  const aberto = estado.abertos.has(item.id);
  const salvando = estado.salvando.has(item.id);
  const status = rotuloEstrangeiro(item.tem_estrangeiro);

  const selo =
    item.tem_estrangeiro === true
      ? `<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-900 ring-1 ring-green-600">Estrangeiro encontrado</span>`
      : item.tem_estrangeiro === false
        ? `<span class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-900 ring-1 ring-red-600">Nenhum estrangeiro</span>`
        : "";

  return `
  <article class="rounded-2xl bg-white p-4 shadow-sm" data-cartao="${item.id}">
    <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">
      Território: ${esc(item.territorio)}
    </p>
    <p class="mt-1 text-base font-semibold leading-snug">${esc(item.endereco)}</p>
    <p class="text-sm text-slate-700">${esc(item.cidade)} - ${esc(item.estado)}</p>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2 py-1 text-xs font-semibold ${classesStatus(item.tem_estrangeiro)}">
        Status: ${esc(status)}
      </span>
      ${selo}
      ${
        item.visita_concluida
          ? `<span class="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-900 ring-1 ring-blue-600">✓ Visita concluída</span>`
          : `<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-400">Visita pendente</span>`
      }
    </div>

    <button
      type="button"
      data-acao="expandir"
      data-id="${item.id}"
      aria-expanded="${aberto}"
      aria-controls="detalhes-${item.id}"
      class="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
    >${aberto ? "Recolher" : "Expandir"}</button>

    <div id="detalhes-${item.id}" class="detalhes mt-0" data-aberto="${aberto}">
      <div>
        <div class="space-y-3 pt-3">
          <p class="text-sm font-semibold">Tem estrangeiro neste endereço?</p>
          <div class="flex gap-2">
            ${botaoResposta(item, true)}
            ${botaoResposta(item, false)}
          </div>

          <div>
            <label for="obs-${item.id}" class="mb-1 block text-sm font-medium text-slate-700"
              >Observação</label
            >
            <textarea
              id="obs-${item.id}"
              rows="3"
              class="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600"
            >${esc(item.observacao ?? "")}</textarea>
          </div>

          <button
            type="button"
            data-acao="salvar-observacao"
            data-id="${item.id}"
            class="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-60"
          >Salvar observação</button>

          <button
            type="button"
            data-acao="${item.visita_concluida ? "desmarcar-visita" : "concluir-visita"}"
            data-id="${item.id}"
            class="w-full rounded-xl border border-blue-700 px-4 py-3 text-sm font-semibold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-60"
          >${item.visita_concluida ? "Desmarcar visita" : "Marcar visita concluída"}</button>

          <button
            type="button"
            data-acao="maps"
            data-id="${item.id}"
            aria-label="Abrir ${esc(item.endereco)} no Google Maps"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >Abrir no Google Maps</button>

          <p class="text-xs text-slate-500">
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
        <div class="animate-pulse rounded-2xl bg-white p-4 shadow-sm">
          <div class="h-3 w-24 rounded bg-slate-200"></div>
          <div class="mt-3 h-4 w-3/4 rounded bg-slate-200"></div>
          <div class="mt-2 h-3 w-1/2 rounded bg-slate-200"></div>
          <div class="mt-4 h-10 w-full rounded bg-slate-100"></div>
        </div>`,
      )
      .join("")
      .concat(
        `<p class="text-center text-sm text-slate-600">Carregando endereços...</p>`,
      );
    return;
  }

  if (estado.erro) {
    el.lista.innerHTML = `
      <div class="rounded-2xl bg-white p-4 text-center shadow-sm">
        <p class="text-sm font-medium text-red-800">${esc(estado.erro)}</p>
        <button
          type="button"
          data-acao="recarregar"
          class="mt-3 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-700"
        >Tentar novamente</button>
      </div>`;
    return;
  }

  const visiveis = enderecosVisiveis();

  if (visiveis.length === 0) {
    el.lista.innerHTML = `
      <div class="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p class="text-sm text-slate-700">
          Nenhum endereço encontrado com os filtros atuais.
        </p>
      </div>`;
    return;
  }

  el.lista.innerHTML = visiveis.map(cartao).join("");
}

function renderizar() {
  renderizarResumo();
  renderizarTerritorios();
  renderizarLista();
}

/* ------------------------------------------------------------------ */
/* Ações dos cartões                                                   */
/* ------------------------------------------------------------------ */

function definirCarregando(botao, carregando, textoOriginal) {
  botao.disabled = carregando;
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

function alternarCartao(id) {
  if (estado.abertos.has(id)) estado.abertos.delete(id);
  else estado.abertos.add(id);
  renderizarLista();
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

el.busca.addEventListener("input", (evento) => {
  estado.busca = evento.target.value;
  renderizarLista();
});

el.status.addEventListener("change", (evento) => {
  estado.status = evento.target.value;
  renderizarLista();
});

el.territorios.addEventListener("click", (evento) => {
  const botao = evento.target.closest("button[data-territorio]");
  if (!botao) return;
  estado.territorio = botao.dataset.territorio;
  localStorage.setItem(CHAVE_TERRITORIO, estado.territorio);
  renderizar();
});

el.lista.addEventListener("click", (evento) => {
  const botao = evento.target.closest("button[data-acao]");
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
      alternarCartao(id);
      break;
    case "tem":
      executarAtualizacao(botao, id, { tem_estrangeiro: true }, "Resposta salva.");
      break;
    case "nao-tem":
      executarAtualizacao(botao, id, { tem_estrangeiro: false }, "Resposta salva.");
      break;
    case "salvar-observacao": {
      const campo = document.getElementById(`obs-${id}`);
      executarAtualizacao(
        botao,
        id,
        { observacao: campo.value.trim() || null },
        "Observação salva.",
      );
      break;
    }
    case "concluir-visita":
      executarAtualizacao(botao, id, { visita_concluida: true }, "Visita concluída.");
      break;
    case "desmarcar-visita":
      executarAtualizacao(botao, id, { visita_concluida: false }, "Visita desmarcada.");
      break;
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

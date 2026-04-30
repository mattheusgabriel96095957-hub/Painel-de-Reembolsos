const { getStore } = require('@netlify/blobs');
const { randomUUID } = require('crypto');

const STORE_NAME = 'reembolso-compartilhado-v1';
const PARAMS_KEY = 'meta/parametros.json';
const PREFIX = {
  colaboradores: 'colaboradores/',
  obras: 'obras/',
  lancamentos: 'lancamentos/'
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sortByNome(items) {
  return [...items].sort((a, b) => asString(a?.nome).localeCompare(asString(b?.nome), 'pt-BR'));
}

function sortLancamentos(items) {
  return [...items].sort((a, b) => {
    const da = new Date(b?.criadoEm || b?.createdAt || b?.updatedAt || 0).getTime();
    const db = new Date(a?.criadoEm || a?.createdAt || a?.updatedAt || 0).getTime();
    return da - db;
  });
}

function collaboratorKey(id) {
  return `${PREFIX.colaboradores}${id}.json`;
}

function obraKey(id) {
  return `${PREFIX.obras}${id}.json`;
}

function lancamentoKey(id) {
  return `${PREFIX.lancamentos}${id}.json`;
}

function normalizeParametros(raw) {
  const data = asObject(raw);
  return {
    vlrKm: asNumber(data.vlrKm, 1.3),
    cafe: asNumber(data.cafe, 20),
    almoco: asNumber(data.almoco, 50),
    jantar: asNumber(data.jantar, 50),
    gestorObra: asString(data.gestorObra),
    admObras: asString(data.admObras),
    cafeInicio: asString(data.cafeInicio) || '06:00',
    cafeFim: asString(data.cafeFim) || '07:00',
    almocoInicio: asString(data.almocoInicio) || '11:30',
    almocoFim: asString(data.almocoFim) || '12:30',
    jantarInicio: asString(data.jantarInicio) || '18:00',
    jantarFim: asString(data.jantarFim) || '19:00'
  };
}

function normalizeColaborador(raw) {
  const data = asObject(raw);
  const now = new Date().toISOString();
  return {
    id: asString(data.id) || `c_${randomUUID()}`,
    nome: asString(data.nome),
    cargo: asString(data.cargo),
    matricula: asString(data.matricula),
    status: asString(data.status) || 'ativo',
    createdAt: asString(data.createdAt) || now,
    updatedAt: now
  };
}

function normalizeObra(raw) {
  const data = asObject(raw);
  const now = new Date().toISOString();
  return {
    id: asString(data.id) || `o_${randomUUID()}`,
    nome: asString(data.nome),
    responsavel: asString(data.responsavel),
    status: asString(data.status) || 'ativa',
    createdAt: asString(data.createdAt) || now,
    updatedAt: now
  };
}

function normalizeLancamento(raw, existing = {}) {
  const data = asObject(raw);
  const prev = asObject(existing);
  const now = new Date().toISOString();
  const status = asString(data.status || prev.status) || 'pendente';

  return {
    id: asString(data.id) || asString(prev.id) || `l_${randomUUID()}`,
    colabId: asString(data.colabId || prev.colabId),
    colab: asString(data.colab || prev.colab),
    matricula: asString(data.matricula || prev.matricula),
    cargo: asString(data.cargo || prev.cargo),
    obraId: asString(data.obraId || prev.obraId),
    obra: asString(data.obra || prev.obra),
    periodo: asString(data.periodo || prev.periodo),
    mes: asString(data.mes || prev.mes),
    total: asNumber(data.total, asNumber(prev.total, 0)),
    km: asNumber(data.km, asNumber(prev.km, 0)),
    combustivel: asNumber(data.combustivel, asNumber(prev.combustivel, 0)),
    refeicoes: asNumber(data.refeicoes, asNumber(prev.refeicoes, 0)),
    outros: asNumber(data.outros, asNumber(prev.outros, 0)),
    status: ['pendente', 'aprovado', 'rejeitado'].includes(status) ? status : 'pendente',
    anexos: asArray(data.anexos || prev.anexos),
    kmDetalhes: asArray(data.kmDetalhes || prev.kmDetalhes),
    refeicoesDetalhes: asArray(data.refeicoesDetalhes || prev.refeicoesDetalhes),
    outrosDetalhes: asArray(data.outrosDetalhes || prev.outrosDetalhes),
    criadoEm: asString(data.criadoEm || prev.criadoEm) || asString(prev.createdAt) || now,
    createdAt: asString(prev.createdAt || data.createdAt || data.criadoEm) || now,
    updatedAt: now
  };
}

async function readList(store, prefix) {
  const { blobs = [] } = await store.list({ prefix });
  const entries = await Promise.all(
    blobs.map(async ({ key }) => {
      const item = await store.get(key, { type: 'json' });
      return item || null;
    })
  );
  return entries.filter(Boolean);
}

async function readSnapshot(store) {
  const [colaboradores, obras, lancamentos, parametros] = await Promise.all([
    readList(store, PREFIX.colaboradores),
    readList(store, PREFIX.obras),
    readList(store, PREFIX.lancamentos),
    store.get(PARAMS_KEY, { type: 'json' })
  ]);

  return {
    colaboradores: sortByNome(colaboradores),
    obras: sortByNome(obras),
    lancamentos: sortLancamentos(lancamentos),
    parametros: parametros ? normalizeParametros(parametros) : null
  };
}

async function hasAnyData(store) {
  const [colaboradores, obras, lancamentos, parametros] = await Promise.all([
    store.list({ prefix: PREFIX.colaboradores }),
    store.list({ prefix: PREFIX.obras }),
    store.list({ prefix: PREFIX.lancamentos }),
    store.get(PARAMS_KEY, { type: 'json' })
  ]);

  return Boolean(
    colaboradores?.blobs?.length ||
    obras?.blobs?.length ||
    lancamentos?.blobs?.length ||
    parametros
  );
}

async function seedIfEmpty(store, payload) {
  const data = asObject(payload);
  if (!(await hasAnyData(store))) {
    for (const colaborador of asArray(data.colaboradores)) {
      const item = normalizeColaborador(colaborador);
      await store.setJSON(collaboratorKey(item.id), item, { onlyIfNew: true });
    }

    for (const obra of asArray(data.obras)) {
      const item = normalizeObra(obra);
      await store.setJSON(obraKey(item.id), item, { onlyIfNew: true });
    }

    for (const lancamento of asArray(data.lancamentos)) {
      const item = normalizeLancamento(lancamento);
      await store.setJSON(lancamentoKey(item.id), item, { onlyIfNew: true });
    }

    if (data.parametros) {
      await store.setJSON(PARAMS_KEY, normalizeParametros(data.parametros), { onlyIfNew: true });
    }
  }

  return readSnapshot(store);
}

async function ensureNoLinkedLancamentos(store, type, id) {
  const lancamentos = await readList(store, PREFIX.lancamentos);
  const hasLinked = lancamentos.some((item) => {
    if (type === 'colaborador') return asString(item.colabId) === id;
    return asString(item.obraId) === id;
  });

  if (hasLinked) {
    throw new Error(
      type === 'colaborador'
        ? 'Não é possível excluir este colaborador porque existem lançamentos vinculados a ele.'
        : 'Não é possível excluir esta obra porque existem lançamentos vinculados a ela.'
    );
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return jsonResponse(200, {
      ok: true,
      message: 'API de persistência do painel de reembolsos ativa.'
    });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Método não permitido.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, { ok: false, error: 'JSON inválido.' });
  }

  const action = asString(body.action);
  const store = getStore(STORE_NAME);

  try {
    switch (action) {
      case 'bootstrap': {
        const data = await readSnapshot(store);
        return jsonResponse(200, { ok: true, data });
      }

      case 'initializeIfEmpty': {
        const data = await seedIfEmpty(store, body.data);
        return jsonResponse(200, { ok: true, data });
      }

      case 'upsertLancamento': {
        const raw = asObject(body.lancamento);
        const id = asString(raw.id) || `l_${randomUUID()}`;
        const current = await store.get(lancamentoKey(id), { type: 'json' });
        const item = normalizeLancamento({ ...raw, id }, current || {});
        await store.setJSON(lancamentoKey(item.id), item);
        return jsonResponse(200, { ok: true, item });
      }

      case 'deleteLancamento': {
        const id = asString(body.id);
        if (!id) throw new Error('ID do lançamento não informado.');
        await store.delete(lancamentoKey(id));
        return jsonResponse(200, { ok: true, id });
      }

      case 'updateLancamentoStatus': {
        const id = asString(body.id);
        const status = asString(body.status);
        if (!id) throw new Error('ID do lançamento não informado.');
        if (!['pendente', 'aprovado', 'rejeitado'].includes(status)) {
          throw new Error('Status inválido.');
        }

        const current = await store.get(lancamentoKey(id), { type: 'json' });
        if (!current) {
          return jsonResponse(404, { ok: false, error: 'Lançamento não encontrado.' });
        }

        const item = normalizeLancamento({ ...current, status }, current);
        await store.setJSON(lancamentoKey(id), item);
        return jsonResponse(200, { ok: true, item });
      }

      case 'upsertColaborador': {
        const item = normalizeColaborador(body.colaborador);
        if (!item.nome) throw new Error('Nome do colaborador é obrigatório.');
        const current = await store.get(collaboratorKey(item.id), { type: 'json' });
        const merged = { ...current, ...item, createdAt: asString(current?.createdAt) || item.createdAt };
        await store.setJSON(collaboratorKey(merged.id), merged);
        return jsonResponse(200, { ok: true, item: merged });
      }

      case 'deleteColaborador': {
        const id = asString(body.id);
        if (!id) throw new Error('ID do colaborador não informado.');
        await ensureNoLinkedLancamentos(store, 'colaborador', id);
        await store.delete(collaboratorKey(id));
        return jsonResponse(200, { ok: true, id });
      }

      case 'upsertObra': {
        const item = normalizeObra(body.obra);
        if (!item.nome) throw new Error('Nome da obra é obrigatório.');
        const current = await store.get(obraKey(item.id), { type: 'json' });
        const merged = { ...current, ...item, createdAt: asString(current?.createdAt) || item.createdAt };
        await store.setJSON(obraKey(merged.id), merged);
        return jsonResponse(200, { ok: true, item: merged });
      }

      case 'deleteObra': {
        const id = asString(body.id);
        if (!id) throw new Error('ID da obra não informado.');
        await ensureNoLinkedLancamentos(store, 'obra', id);
        await store.delete(obraKey(id));
        return jsonResponse(200, { ok: true, id });
      }

      case 'saveParametros': {
        const item = normalizeParametros(body.parametros);
        await store.setJSON(PARAMS_KEY, item);
        return jsonResponse(200, { ok: true, item });
      }

      default:
        return jsonResponse(400, { ok: false, error: 'Ação inválida.' });
    }
  } catch (error) {
    console.error('[reembolso-api]', error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || 'Falha interna na persistência compartilhada.'
    });
  }
};

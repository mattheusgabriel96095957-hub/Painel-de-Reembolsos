function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}import { getStore } from '@netlify/blobs';

const store = getStore('reembolso-viagens-v1');


async function listCollection(prefix) {
  const { blobs } = await store.list({ prefix: `${prefix}/` });
  const items = await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' })));
  return items.filter(Boolean);
}

async function bootstrapData() {
  const [colaboradores, obras, lancamentos, parametros] = await Promise.all([
    listCollection('colaboradores'),
    listCollection('obras'),
    listCollection('lancamentos'),
    store.get('parametros/config', { type: 'json' })
  ]);

  return {
    colaboradores: colaboradores.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    obras: obras.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    lancamentos: lancamentos.sort((a, b) => new Date(b.criadoEm || b.updatedAt || 0).getTime() - new Date(a.criadoEm || a.updatedAt || 0).getTime()),
    parametros: parametros || null,
    syncedAt: new Date().toISOString()
  };
}

async function initializeIfEmpty(data = {}) {
  const snapshot = await bootstrapData();
  const vazio = !snapshot.colaboradores.length && !snapshot.obras.length && !snapshot.lancamentos.length && !snapshot.parametros;

  if (!vazio) {
    return snapshot;
  }

  for (const colaborador of data.colaboradores || []) {
    if (colaborador?.id) await store.setJSON(`colaboradores/${colaborador.id}`, colaborador);
  }
  for (const obra of data.obras || []) {
    if (obra?.id) await store.setJSON(`obras/${obra.id}`, obra);
  }
  for (const lancamento of data.lancamentos || []) {
    if (lancamento?.id) await store.setJSON(`lancamentos/${lancamento.id}`, lancamento);
  }
  if (data.parametros && typeof data.parametros === 'object') {
    await store.setJSON('parametros/config', data.parametros);
  }

  return bootstrapData();
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não suportado.' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    switch (action) {
      case 'bootstrap': {
        return jsonResponse({ ok: true, data: await bootstrapData() });
      }
      case 'initializeIfEmpty': {
        return jsonResponse({ ok: true, data: await initializeIfEmpty(body.data) });
      }
      case 'upsertColaborador': {
        const colaborador = body.colaborador;
        if (!colaborador?.id) return jsonResponse({ ok: false, error: 'Colaborador inválido.' }, 400);
        await store.setJSON(`colaboradores/${colaborador.id}`, { ...colaborador, updatedAt: new Date().toISOString() });
        return jsonResponse({ ok: true });
      }
      case 'deleteColaborador': {
        if (!body.id) return jsonResponse({ ok: false, error: 'ID obrigatório.' }, 400);
        await store.delete(`colaboradores/${body.id}`);
        return jsonResponse({ ok: true });
      }
      case 'upsertObra': {
        const obra = body.obra;
        if (!obra?.id) return jsonResponse({ ok: false, error: 'Obra inválida.' }, 400);
        await store.setJSON(`obras/${obra.id}`, { ...obra, updatedAt: new Date().toISOString() });
        return jsonResponse({ ok: true });
      }
      case 'deleteObra': {
        if (!body.id) return jsonResponse({ ok: false, error: 'ID obrigatório.' }, 400);
        await store.delete(`obras/${body.id}`);
        return jsonResponse({ ok: true });
      }
      case 'upsertLancamento': {
        const lancamento = body.lancamento;
        if (!lancamento?.id) return jsonResponse({ ok: false, error: 'Lançamento inválido.' }, 400);
        const existente = await store.get(`lancamentos/${lancamento.id}`, { type: 'json' });
        const salvo = {
          ...existente,
          ...lancamento,
          criadoEm: existente?.criadoEm || lancamento.criadoEm || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await store.setJSON(`lancamentos/${lancamento.id}`, salvo);
        return jsonResponse({ ok: true, data: salvo });
      }
      case 'updateLancamentoStatus': {
        if (!body.id || !body.status) return jsonResponse({ ok: false, error: 'ID e status são obrigatórios.' }, 400);
        const existente = await store.get(`lancamentos/${body.id}`, { type: 'json' });
        if (!existente) return jsonResponse({ ok: false, error: 'Lançamento não encontrado.' }, 404);
        const atualizado = { ...existente, status: body.status, updatedAt: new Date().toISOString() };
        await store.setJSON(`lancamentos/${body.id}`, atualizado);
        return jsonResponse({ ok: true, data: atualizado });
      }
      case 'deleteLancamento': {
        if (!body.id) return jsonResponse({ ok: false, error: 'ID obrigatório.' }, 400);
        await store.delete(`lancamentos/${body.id}`);
        return jsonResponse({ ok: true });
      }
      case 'saveParametros': {
        const parametros = body.parametros;
        if (!parametros || typeof parametros !== 'object') return jsonResponse({ ok: false, error: 'Parâmetros inválidos.' }, 400);
        await store.setJSON('parametros/config', { ...parametros, updatedAt: new Date().toISOString() });
        return jsonResponse({ ok: true });
      }
      default:
        return jsonResponse({ ok: false, error: 'Ação inválida.' }, 400);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message || 'Erro interno.' }, 500);
  }
}

// Keep legacy collections intact; only add the optional general-observation list.
export function normalizeJournal(journal) {
  const result = {...journal};
  for (const field of ['conditions', 'pain', 'cycles', 'meds', 'intakes', 'observations']) {
    if (result[field] === undefined) result[field] = [];
    if (!Array.isArray(result[field])) throw new Error('Ungültiges Journalformat.');
  }
  return result;
}

export function observationFeed(journal, filter = 'all') {
  const topic = id => journal.conditions.find(item => item.id === id)?.name || '';
  const general = (journal.observations || []).map(item => ({
    ...item, kind: 'general', collection: 'observations', label: 'Allgemein',
    topic: topic(item.topicId),
    details: [item.tone, item.value === '' || item.value == null ? '' : `${item.value} ${item.unit || ''}`.trim()].filter(Boolean),
  }));
  const pain = journal.pain.map(item => ({
    ...item, kind: 'pain', collection: 'pain', label: 'Schmerz',
    title: topic(item.conditionId) || 'Schmerz', topic: '',
    details: [item.location, `Stärke ${item.level}/10`].filter(Boolean),
  }));
  const cycles = journal.cycles.map(item => ({
    ...item, kind: 'cycle', collection: 'cycles', label: 'Menstruation',
    title: item.periodStart ? 'Periodenbeginn' : 'Menstruation', topic: '',
    details: [`Blutung: ${item.flow}`, ...(item.symptoms || []), `Beschwerdestärke ${item.level}/10`],
  }));
  return [...general, ...pain, ...cycles]
    .filter(item => filter === 'all' || item.kind === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
}

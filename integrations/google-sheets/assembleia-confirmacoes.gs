const CONFIG = PropertiesService.getScriptProperties();

function checkSheetAccess() {
  const sheet = SpreadsheetApp.openById(CONFIG.getProperty('SPREADSHEET_ID'))
    .getSheetByName(CONFIG.getProperty('SHEET_NAME') || 'Confirmações_assembleia');
  if (!sheet) {
    throw new Error('Sheet not found');
  }
  console.log(`Connected to ${sheet.getName()}`);
}

function doPost(event) {
  if (event.parameter?.token !== CONFIG.getProperty('WEBHOOK_TOKEN')) {
    return respond({ ok: false, error: 'unauthorized' });
  }

  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (!payload.submissionId || !payload.titular?.nomeRazaoSocial || !payload.titular?.cpfCnpj || !payload.telefone) {
      return respond({ ok: false, error: 'invalid-payload' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const sheet = SpreadsheetApp.openById(CONFIG.getProperty('SPREADSHEET_ID'))
        .getSheetByName(CONFIG.getProperty('SHEET_NAME') || 'Confirmações_assembleia');
      if (!sheet) {
        throw new Error('Sheet not found');
      }
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['submission_id', 'confirmado_em', 'titular', 'cpf_cnpj', 'telefone', 'status', 'consentimento_em']);
      }
      if (!sheet.createTextFinder(payload.submissionId).matchEntireCell(true).findNext()) {
        sheet.appendRow([
          payload.submissionId,
          payload.submittedAt,
          payload.titular.nomeRazaoSocial,
          payload.titular.cpfCnpj,
          payload.telefone,
          payload.status,
          payload.consentimento?.aceitoEm || ''
        ]);
      }
    } finally {
      lock.releaseLock();
    }

    return respond({ ok: true });
  } catch (error) {
    console.error(error.message);
    return respond({ ok: false, error: 'write-failed' });
  }
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

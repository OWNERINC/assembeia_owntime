const config = window.OWNTIME_ASSEMBLEIA_CONFIG || {};
const edital = document.querySelector('[data-edital]');
const privacy = document.querySelector('[data-privacy]');
const form = document.querySelector('form');
const submit = form.querySelector('button[type="submit"]');
const status = document.querySelector('[data-status]');
const consentCopy = document.querySelector('[data-consent-copy]');

function hideMissingImage(image) {
  image.hidden = true;
  const fallback = image.nextElementSibling;
  if (fallback?.classList.contains('brand-fallback')) {
    fallback.hidden = false;
  }
}

document.querySelectorAll('img').forEach((image) => {
  image.addEventListener('error', () => hideMissingImage(image));
  if (image.complete && image.naturalWidth === 0) {
    hideMissingImage(image);
  }
});

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `form-status ${type}`;
}

function formatDocument(value) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

document.querySelector('[name="documento"]').addEventListener('input', (event) => {
  event.target.value = formatDocument(event.target.value);
});

document.querySelector('[name="telefone"]').addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});

if (config.editalUrl) {
  edital.href = config.editalUrl;
  edital.removeAttribute('aria-disabled');
  edital.textContent = 'Edital de convocação';
} else {
  edital.textContent = 'Edital em breve';
}

if (config.privacyPolicyUrl) {
  privacy.href = config.privacyPolicyUrl;
} else {
  privacy.remove();
  submit.disabled = true;
  consentCopy.textContent = 'A confirmação online será habilitada após a publicação da Política de Privacidade.';
  setStatus('O formulário será habilitado quando a política de privacidade estiver disponível.');
}

if (!config.formEnabled) {
  submit.disabled = true;
  setStatus('As confirmações online serão habilitadas em breve.');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  form.classList.add('was-validated');
  if (!form.reportValidity()) {
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Enviando...';
  setStatus('');
  const data = new FormData(form);
  const payload = Object.fromEntries(data);
  payload.consentimento = data.get('consentimento') === 'on';

  try {
    const response = await fetch('/api/owntime-assembleia/confirmacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível concluir a confirmação.');
    }
    form.reset();
    setStatus('Presença confirmada. Em breve você receberá as próximas comunicações.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Confirmar presença';
  }
});

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function checkDigit(value, weights) {
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCpf(cpf) {
  return cpf.length === 11 && !/^(\d)\1+$/.test(cpf)
    && Number(cpf[9]) === checkDigit(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
    && Number(cpf[10]) === checkDigit(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
}

function isValidCnpj(cnpj) {
  return cnpj.length === 14 && !/^(\d)\1+$/.test(cnpj)
    && Number(cnpj[12]) === checkDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    && Number(cnpj[13]) === checkDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}

export function validateConfirmation(input) {
  const titular = String(input?.titular || '').trim().replace(/\s+/g, ' ');
  const documento = digits(input?.documento);
  const telefone = digits(input?.telefone);

  if (titular.length < 3 || titular.length > 160) {
    return { error: 'Informe o nome ou razão social do titular.' };
  }
  if (!(isValidCpf(documento) || isValidCnpj(documento))) {
    return { error: 'Informe um CPF ou CNPJ válido.' };
  }
  if (!/^[1-9]\d{9,10}$/.test(telefone)) {
    return { error: 'Informe um telefone de contato válido.' };
  }
  if (input?.consentimento !== true) {
    return { error: 'O aceite para contato é obrigatório.' };
  }
  if (String(input?.website || '').trim()) {
    return { blocked: true };
  }

  return {
    value: { titular, documento, telefone }
  };
}

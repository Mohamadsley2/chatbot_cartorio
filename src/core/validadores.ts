import { config } from "../config.js";
import { dataISO, partesNoFuso } from "./horario.js";

export type Validacao = { ok: true; valor: string } | { ok: false; erro: string };

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function digitosVerificadoresCpfOk(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcular = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
}

function digitosVerificadoresCnpjOk(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcular = (tamanho: number): number => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cnpj[i]) * Number(pesos[i]);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

// Valida apenas o FORMATO do documento (quantidade de dígitos e dígito
// verificador). O bot nunca consulta base nenhuma — isso é feito pela atendente.
export function validarDocumento(texto: string): Validacao {
  const digitos = somenteDigitos(texto);

  if (digitos.length !== 11 && digitos.length !== 14) {
    return {
      ok: false,
      erro: "Não reconheci esse número. Informe seu CPF (11 dígitos) ou CNPJ (14 dígitos), somente números.",
    };
  }

  if (config.documento.validarDigitoVerificador) {
    const valido = digitos.length === 11 ? digitosVerificadoresCpfOk(digitos) : digitosVerificadoresCnpjOk(digitos);
    if (!valido) {
      const tipo = digitos.length === 11 ? "CPF" : "CNPJ";
      return { ok: false, erro: `Esse ${tipo} parece estar incorreto. Pode conferir e enviar novamente?` };
    }
  }

  return { ok: true, valor: formatarDocumento(digitos) };
}

export function formatarDocumento(digitos: string): string {
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  if (digitos.length === 14) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  }
  return digitos;
}

export function validarNome(texto: string): Validacao {
  const nome = texto.trim().replace(/\s+/g, " ");

  if (nome.length < 5 || !nome.includes(" ")) {
    return { ok: false, erro: "Preciso do nome completo (nome e sobrenome). Pode enviar novamente?" };
  }
  if (!/^[\p{L}\s'.-]+$/u.test(nome)) {
    return { ok: false, erro: "O nome parece ter números ou símbolos. Pode enviar apenas o nome completo?" };
  }

  return { ok: true, valor: nome };
}

export function validarTexto(texto: string): Validacao {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo.length < 3) return { ok: false, erro: "Pode me contar com um pouco mais de detalhe?" };
  return { ok: true, valor: limpo };
}

export function validarValor(texto: string): Validacao {
  const limpo = texto.replace(/r\$/i, "").trim();

  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) {
    return { ok: false, erro: "Não entendi o valor. Informe assim: 350,00" };
  }

  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);

  if (!Number.isFinite(numero) || numero <= 0) {
    return { ok: false, erro: "Não entendi o valor. Informe assim: 350,00" };
  }

  return { ok: true, valor: numero.toFixed(2).replace(".", ",") };
}

export function validarData(texto: string, agora: Date): Validacao {
  const encontrado = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!encontrado) return { ok: false, erro: "Não entendi a data. Informe assim: 14/05/2026" };

  const dia = Number(encontrado[1]);
  const mes = Number(encontrado[2]);
  const anoBruto = Number(encontrado[3]);
  const ano = anoBruto < 100 ? 2000 + anoBruto : anoBruto;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const consistente = data.getUTCDate() === dia && data.getUTCMonth() === mes - 1 && data.getUTCFullYear() === ano;
  if (!consistente) return { ok: false, erro: "Essa data não existe. Informe assim: 14/05/2026" };

  const hoje = partesNoFuso(agora);
  const isoInformada = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (isoInformada > dataISO(agora)) {
    return { ok: false, erro: "Essa data é no futuro. Informe a data em que o pagamento foi feito." };
  }
  if (ano < hoje.ano - 5) {
    return { ok: false, erro: "Essa data parece muito antiga. Pode conferir?" };
  }

  return { ok: true, valor: `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}` };
}

export function validarOpcao(texto: string, opcoes: string[]): Validacao {
  const escolha = Number(texto.trim());

  if (!Number.isInteger(escolha) || escolha < 1 || escolha > opcoes.length) {
    return { ok: false, erro: `Escolha um número de 1 a ${opcoes.length}.` };
  }

  return { ok: true, valor: String(opcoes[escolha - 1]) };
}

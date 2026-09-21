import { config } from "../config.js";

interface PartesData {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  diaDaSemana: number; // 0 = domingo
}

const DIAS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Lê a data no fuso do cartório, independente do fuso do servidor.
export function partesNoFuso(data: Date): PartesData {
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: config.fusoHorario,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const partes: Record<string, string> = {};
  for (const parte of formatador.formatToParts(data)) partes[parte.type] = parte.value;

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    diaDaSemana: Math.max(0, DIAS_EN.indexOf(partes.weekday ?? "")),
  };
}

// "2026-08-19" — usada como chave do dia na fila e no protocolo.
export function dataISO(data: Date): string {
  const { ano, mes, dia } = partesNoFuso(data);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function dataBR(data: Date): string {
  const { ano, mes, dia } = partesNoFuso(data);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

export function horaBR(data: Date): string {
  const { hora, minuto } = partesNoFuso(data);
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function paraMinutos(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

function ehFeriado(data: Date): boolean {
  const iso = dataISO(data);
  return config.atendimento.feriados.some((f) => f === iso || f === iso.slice(5));
}

function ehDiaUtil(data: Date): boolean {
  const { diaDaSemana } = partesNoFuso(data);
  return config.atendimento.diasDaSemana.includes(diaDaSemana) && !ehFeriado(data);
}

export function dentroDoHorario(data: Date): boolean {
  const { hora, minuto } = partesNoFuso(data);

  if (!ehDiaUtil(data)) return false;

  const agora = hora * 60 + minuto;
  return agora >= paraMinutos(config.atendimento.inicio) && agora <= paraMinutos(config.atendimento.fim);
}

// A partir de uma data qualquer, acha o próximo dia útil (dia da semana permitido
// e não-feriado) — ignora o horário, só o dia. Usada para decidir em qual fila
// cai uma mensagem recebida fora do horário oficial.
export function proximoDiaUtil(data: Date): Date {
  let candidato = new Date(data.getTime());

  do {
    candidato = new Date(candidato.getTime() + 24 * 60 * 60 * 1000);
  } while (!ehDiaUtil(candidato));

  return candidato;
}

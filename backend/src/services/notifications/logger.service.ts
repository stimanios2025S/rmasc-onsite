export type NiveauLog = 'debug' | 'info' | 'warn' | 'error';

export class LoggerService {
  private readonly niveaux: Record<NiveauLog, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  private readonly seuil: number;

  constructor(private readonly contexte: string = 'RMASC', niveauMin: NiveauLog = 'debug') {
    this.seuil = this.niveaux[niveauMin] ?? 0;
  }

  private emettre(niveau: NiveauLog, message: string, meta?: Record<string, unknown>) {
    if (this.niveaux[niveau] < this.seuil) return;
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), niveau, contexte: this.contexte, message, meta });
    if (niveau === 'error') console.error(entry);
    else if (niveau === 'warn') console.warn(entry);
    else console.log(entry);
  }

  debug = (msg: string, m?: Record<string, unknown>) => this.emettre('debug', msg, m);
  info = (msg: string, m?: Record<string, unknown>) => this.emettre('info', msg, m);
  warn = (msg: string, m?: Record<string, unknown>) => this.emettre('warn', msg, m);
  error = (msg: string, m?: Record<string, unknown>) => this.emettre('error', msg, m);
}

export class ErroDominio extends Error {
  readonly codigo: string;
  readonly status: number;

  constructor(codigo: string, mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroDominio";
    this.codigo = codigo;
    this.status = status;
  }
}

export const MOTOR_INDISPONIVEL = "MOTOR_INDISPONIVEL"; // 503
export const ENTRADA_INVALIDA = "ENTRADA_INVALIDA"; // 400
export const PREMISSA_AUSENTE = "PREMISSA_AUSENTE"; // 422
export const NAO_ENCONTRADO = "NAO_ENCONTRADO"; // 404
export const CONJUNTO_VALIDADO = "CONJUNTO_VALIDADO"; // 409

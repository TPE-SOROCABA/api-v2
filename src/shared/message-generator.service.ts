import { Injectable } from '@nestjs/common';

export enum MessageType {
  INVITATION = 'INVITATION',
  INVITATION_GROUP = 'INVITATION_GROUP',
  CANCELLATION = 'CANCELLATION',
  CANCELLATION_GROUP = 'CANCELLATION_GROUP',
  OTP = 'OTP',
  OTP_SIMPLE = 'OTP_SIMPLE',
  COORDINATOR_ALERT = 'COORDINATOR_ALERT',
  COMPLETED_NOTIFICATION = 'COMPLETED_NOTIFICATION',
  ARCHIVE_NOTIFICATION = 'ARCHIVE_NOTIFICATION',
  INVITATION_GROUP_TEXT = 'INVITATION_GROUP_TEXT',
}

export interface MessageData {
  recipientName: string;
  details?: string;
  code?: string;
  loginLink?: string;
  generalLink?: string;
}

/**
 * Textos das mensagens de WhatsApp.
 *
 * Portado 1:1 de `api/src/services/MessageGenerator.ts`. Os textos são o que o
 * voluntário recebe no celular — mudar uma palavra aqui muda a mensagem real,
 * então tratar como contrato com o produto, não como texto livre.
 */
@Injectable()
export class MessageGeneratorService {
  private variations = {
    greetings: ['Olá', 'Oi', 'Oi!', 'Olá!'],
    closings: ['Equipe TPE Digital', 'Atenciosamente, TPE Digital', 'Obrigado, TPE Digital'],
  };

  private templates: Record<MessageType, string[]> = {
    [MessageType.INVITATION]: [
      '📢 TPE Digital | Nova Designação\n\n[GREETING], [NAME]! 😊\n\nVocê recebeu uma nova designação:\n*[DETAILS]*\n\n👉 Para consultar os detalhes e confirmar sua presença, acesse o TPE Digital.\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
    [MessageType.INVITATION_GROUP]: [
      '📢 TPE Digital | Designação disponível\n\n[GREETING] 😊\n\nA designação de [DETAILS] já está disponível no TPE Digital.\n\n👉 Para consultar os detalhes, utilize um dos botões abaixo:\n• Designação Geral – visão completa\n• Minha Designação – sua designação individual\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
    [MessageType.CANCELLATION]: [
      '📢 TPE Digital | Designação Cancelada\n\n[GREETING], [NAME]!\n\nInformamos que sua designação para *[DETAILS]* foi cancelada.\n\nSentimos pelo imprevisto e contamos com sua ajuda em uma próxima oportunidade.\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
    [MessageType.CANCELLATION_GROUP]: [
      '📢 TPE Digital | Aviso de Cancelamento\n\n[GREETING] 😊\n\nInformamos que a designação para *[DETAILS]* foi cancelada. Favor desconsiderar a escala anterior.\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
    [MessageType.OTP]: [
      '📢 TPE Digital | Código de Verificação\n\n[GREETING], [NAME]! 😊\n\nRecebemos uma solicitação para acessar sua conta ou redefinir sua senha.\n\n👉 Seu código de verificação é: *[CODE]*\n\nEste código é válido por 5 minutos. Se você não solicitou este código, por favor, desconsidere esta mensagem.\n\n[CLOSING]',
    ],
    [MessageType.OTP_SIMPLE]: ['📢 TPE Digital | Código de Verificação\n\n[GREETING], [NAME]! 😊\n\nSegue o seu código de verificação *[CODE]*\n\n[CLOSING]'],
    [MessageType.COORDINATOR_ALERT]: [
      '📢 TPE Digital | Alerta de Designação Próxima\n\n[GREETING], [NAME]! ⚠️\n\nAtenção: A designação *[DETAILS]* inicia em menos de 2 horas.\n\nPor favor, verifique se todos os participantes já estão cientes e confirmados.\n\n👉 Acesse o painel do coordenador para acompanhar.\n\n[CLOSING]',
    ],
    [MessageType.COMPLETED_NOTIFICATION]: [
      '📢 TPE Digital | Justificativa de Ausência\n\n[GREETING]! 😊\n\nA designação *[DETAILS]* foi finalizada, mas notamos que alguns de vocês não puderam participar. Acesse o link abaixo para *Justificar*:\n\n👤 *Minha Designação*\n[LOGIN_LINK]\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
    [MessageType.ARCHIVE_NOTIFICATION]: [
      '📢 TPE Digital | Designação Arquivada\n\n[GREETING], [NAME]!\n\nA designação *[DETAILS]* foi arquivada e encerrada no sistema.\n\nA partir de agora, não é mais possível realizar edições nesta designação.\n\n[CLOSING]',
    ],
    [MessageType.INVITATION_GROUP_TEXT]: [
      '📢 *TPE Digital | Designação disponível*\n\n[GREETING] 😊\n\nA designação de [DETAILS] já está disponível.\n\n🔗 *Para consultar os detalhes, acesse os links abaixo:*\n\n🌐 *Designação Geral*\n[GENERAL_LINK]\n\n👤 *Minha Designação*\n[LOGIN_LINK]\n\nEm caso de dúvidas técnicas ou necessidade de atualização de dados, entre em contato com o SAC TPE Digital.\n\n[CLOSING]',
    ],
  };

  generate(type: MessageType, data: MessageData): string {
    const template = this.getRandom(this.templates[type]);
    const greeting = this.getRandom(this.variations.greetings);
    const closing = this.getRandom(this.variations.closings);

    let message = this.replaceAll(template, '[GREETING]', greeting).replace('[NAME]', data.recipientName).replace('[CLOSING]', closing);

    if (data.details) {
      message = this.replaceAll(message, '[DETAILS]', data.details);
    }

    if (data.code) {
      message = this.replaceAll(message, '[CODE]', data.code);
    }

    if (data.loginLink) {
      message = this.replaceAll(message, '[LOGIN_LINK]', data.loginLink);
    }

    if (data.generalLink) {
      message = this.replaceAll(message, '[GENERAL_LINK]', data.generalLink);
    }

    return message;
  }

  /**
   * A legacy usava `String.replace`, que troca só a primeira ocorrência. Todos os
   * templates atuais usam cada placeholder uma vez só, então a saída é idêntica —
   * mas trocar todas evita que um placeholder repetido passe a vazar cru pro
   * voluntário sem quebrar nada.
   */
  private replaceAll(text: string, placeholder: string, value: string): string {
    return text.split(placeholder).join(value);
  }

  private getRandom(array: unknown[]): string {
    return array[Math.floor(Math.random() * array.length)] as string;
  }
}

/** 業務エラー。HTTP のステータスへの変換は app.ts で行う */
export class BusinessError extends Error {}
export class NotFoundError extends BusinessError {}
/** 今の状態ではできない操作(確定済みのグループへの患者の追加など) */
export class ConflictError extends BusinessError {}
export class ValidationError extends BusinessError {}

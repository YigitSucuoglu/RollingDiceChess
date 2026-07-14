import type { PieceType } from "../types/Chess";

export default class TurnRights {

  private rights: Record<PieceType, number>;

  constructor() {
    this.rights = {
      pawn: 0,
      knight: 0,
      bishop: 0,
      rook: 0,
      queen: 0,
      king: 0,
    };
  }

  public set(piece: PieceType, count: number): void {
    this.rights[piece] = count;
  }

  public get(piece: PieceType): number {
    return this.rights[piece];
  }

  public has(piece: PieceType): boolean {
    return this.rights[piece] > 0;
  }

  public consume(piece: PieceType): void {
    if (this.rights[piece] > 0) {
      this.rights[piece]--;
    }
  }
  
  public hasAnyRights(): boolean {

    return Object.values(this.rights).some(
        count => count > 0
    );

  }
  

}
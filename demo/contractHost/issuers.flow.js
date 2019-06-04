// @flow

// ISSUE: how to represent guards?
export type G<T> = T;

// ISSUE: where do E, makePromise belong? how do they come into scope?
// ISSUE: E handles T as well as Promise<T>, but then flow needs
//        help at the call site to distinguish, and it's ugly.
declare export function E<T>(x: Promise<T>): T;
export interface PromiseParts<T> {
  p: Promise<T>;
  res(T | Promise<T>): void;
  rej(mixed): void;
  reject(mixed): void;
}
declare export function makePromise<T>(): PromiseParts<T>;

export type Label<Q> = { issuer: Issuer<Q>, description: mixed };
export type Amount<Q> = { label: Label<Q>, quantity: Q };

export interface Assay<Quantity> {
  getLabel() :Label<Quantity>;
  make(allegedQuantity: G<Quantity>) :Amount<Quantity>;
  vouch(amount: G<Amount<Quantity>>) :Amount<Quantity>;
  coerce(amountLike: G<Amount<Quantity>>) :Amount<Quantity>;
  quantity(amount: G<Amount<Quantity>>) :Quantity;
  empty() :Amount<Quantity>;
  isEmpty(amount: G<Amount<Quantity>>) :boolean;
  includes(leftAmount: G<Amount<Quantity>>,
           rightAmount: G<Amount<Quantity>>) :boolean;
  with(leftAmount: G<Amount<Quantity>>,
       rightAmount: G<Amount<Quantity>>) :Amount<Quantity>;
  without(leftAmount: G<Amount<Quantity>>,
          rightAmount: G<Amount<Quantity>>) :Amount<Quantity>;
}
declare export function makeNatAssay(label :Label<number>) :Assay<number>;
declare export function makeMetaSingleAssayMaker<Q>(
  baseLabelToAssayFn :(Label<Q> => Assay<Q>)) :(Label<Q> => Assay<Q>);

export interface Issuer<Q> {
  getLabel() :{ issuer :Issuer<Q>, description: mixed };
  getAssay() :Assay<Q>;
  makeEmptyPurse(name: G<string>) :Purse<Q>;
  getExclusive(amount: Amount<Q>, srcPaymentP: Promise<Payment<Q>>, name?: string): Promise<Payment<Q>>;
  getExclusiveAll(srcPaymentP: Promise<Payment<Q>>, name?: string): Promise<Payment<Q>>;
  slash(amount: Amount<Q>, srcPaymentP: Promise<Payment<Q>>): Promise<Amount<Q>> ;
  slashAll(srcPaymentP: Promise<Payment<Q>>): Promise<Amount<Q>>;
}
export interface Mint<Q> {
  getIssuer(): Issuer<Q>;
  mint(initialBalance: G<Amount<Q>>, name: G<string>) :Purse<Q>;
}
export interface Payment<Q> {
  getIssuer() :Issuer<Q>;
  getXferBalance() :Amount<Q>;
}
export interface Purse<Q> extends Payment<Q> {
  getUseBalance() :Amount<Q>;
  deposit(
    amount: G<Amount<Q>>,
    // srcPaymentP: ?reveal[Promise]
    srcPaymentP: Promise<Payment<Q>>
  ): Promise<Amount<Q>>;
  depositAll(srcPaymentP: Promise<Payment<Q>>): Promise<Amount<Q>>;
  withdraw(amount: G<Amount<Q>>, name: G<string>) :Payment<Q>;
  withdrawAll(name: G<string>): Payment<Q>;
}
declare export function makeMint<Q>(description: mixed,
            makeAssay :(Label<Q> => Assay<Q>)) :Mint<Q>;

export interface Peg<Q> {
  getLocalIssuer(): Issuer<Q>;
  getRemoteIssuer(): Promise<Issuer<Q>>;
  retainAll(remotePaymentP: Promise<Payment<Q>>, name: string): Promise<Payment<Q>>; 
  redeemAll(localPayment: Promise<Payment<Q>>, name: string): Promise<Payment<Q>>;
}
declare export function makePeg<Q>(e: typeof E,
                remoteIssuerP: G<Promise<Issuer<Q>>>,
                makeAssay :(Label<Q> => Assay<Q>)) :Promise<Peg<Q>>;

export interface InviteMaker {
  make(seatDesc: mixed, seat: mixed, name: ?string): Payment<mixed>;
  redeem(allegedInvitePayment: G<Payment<mixed>>): Promise<any>;
}

export interface Timer {
  delayUntil(deadline: mixed, resolution? :number): Promise<void>
}

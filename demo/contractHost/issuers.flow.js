// @flow

// ISSUE: how to represent guards?
export type G<T> = T;

// ISSUE: where do E, makePromise belong? how do they come into scope?
declare export function E<T>(x: T | Promise<T>): T;
declare export function makePromise<T>(): {
  p: Promise<T>,
  res: (T) => void,
  rej: (any) => void,
  reject: (any) => void,
};

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
  makeEmptyPurse(name: G<String>) :Purse<Q>;
  getExclusive(amount :Amount<Q>, srcPaymentP: Promise<Payment<Q>>, name: ?string): Payment<Q>
}
export interface Mint<Q> {
  getIssuer(): Issuer<Q>;
  mint(initialBalance: G<Amount<Q>>, name: G<String>) :Purse<Q>;
}
export interface Payment<Q> {
  getIssuer() :Issuer<Q>;
  getXferBalance() :Amount<Q>;
}
export interface Purse<Q> {
  getIssuer() :Issuer<Q>;
  getXferBalance() :Amount<Q>;
  getUseBalance() :Amount<Q>;
  deposit(
    amount: G<Amount<Q>>,
    // srcPaymentP: ?reveal[Promise]
    srcPaymentP: Promise<Payment<Q>>
  ) :Amount<Q>;
  withdraw(amount: G<Amount<Q>>, name: G<String>) :Purse<Q>;
}
declare export function makeMint<Q>(description: mixed,
            makeAssay :(Label<Q> => Assay<Q>)) :Mint<Q>;

export interface Peg<RemoteQ, LocalQ> {
  getLocalIssuer() :Issuer<LocalQ>;
  getRemoteIssuer() :Promise<Issuer<RemoteQ>>;
  retain(remoteAmount: Promise<Amount<RemoteQ>>,
         remotePaymentP: Promise<Payment<RemoteQ>>,
         name: G<String>) :Payment<LocalQ>;
  redeem(localAmount: G<Amount<LocalQ>>,
         localPayment: G<Payment<LocalQ>>,
         name: G<String>) :Promise<Payment<RemoteQ>>;
}
declare export function makePeg<LQ, RQ>(e: typeof E,
                remoteIssuerP: G<Promise<Issuer<RQ>>>,
                makeAssay :(Label<LQ> => Assay<LQ>)) :Peg<LQ, RQ>;

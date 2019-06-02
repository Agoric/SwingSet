// ISSUE: how to represent guards?
type G<T> = T;

// ISSUE: where do E, makePromise belong? how do they come into scope?
E<T>(x: T | Promise<T>) => T;
makePromise<T>(): {
  p: Promise<T>,
  res: (T) -> void,
  rej: (any) -> void,
  reject: (any) -> void,
};

type Label<Q> = { issuer: Issuer<Q>, description: mixed };
type Amount<Q> = { label: Label<Q>, quantity: Q };

interface Assay<Quantity> {
  getLabel() ::Label;
  make(allegedQuantity G<Quantity>) :Amount<Quantity>;
  vouch(amount: G<Amount<Quantity>>) :Amount<Quantity>
  coerce(amountLike: G<Amount<Quantity>>) :Amount<Quantity>;
  quantity(amount: G<Amount<Quantity>>) :Quantity;
  empty() :Amount<Quantity>;
  isEmpty(amount: G<Amount<Quantity>>) :boolean;
  includes(leftAmount: G<Amount<Quantity>>,
           rightAmount: G<Amount<Quantity>>) :boolean;
  with(leftAmount: G<Amount<Quantity>>,
       rightAmount: G<Amount<Quantity>>) :Amount;
  without(leftAmount: G<Amount<Quantity>>,
          rightAmount: G<Amount<Quantity>>) :Amount;
}
makeNatAssay(label :Label) :Assay;
makeMetaSingleAssayMaker<Q>(
  baseLabelToAssayFn :(Label -> Assay<Q>)) :(Label -> Assay<Q>);

interface Issuer<Q> {
  getLabel() :{ issuer :Issuer<Q>, description: mixed };
  getAssay() :Assay<Q>;
  makeEmptyPurse(name: G<String>) :Purse;

}
interface Mint<Q> {
  getIssuer(): Issuer<Q>;
  mint(initialBalance: G<Amount<Q>>, name: G<String>) :Purse;
}
interface Payment<Q> {
  getIssuer() :Issuer<Q>;
  getXferBalance() :Amount<Q>;
}
class Purse<Q> {
  getIssuer() ::Issuer<Q>;
  getXferBalance() ::Amount<Q>;
  getUseBalance() ::Amount<Q>;
  deposit(
    amount: G<Amount>,
    // srcPaymentP: ?reveal[Promise]
    srcPaymentP: Promise<Payment>
  ) :Amount<Q>;
  withdraw(amount: G<Amount>, name: G<String>) :Purse<Q>;
}
makeMint<Q>(description: mixed,
            makeAssay :(Label<Q> -> Assay<Q>)) :Mint<Q>;

interface Peg<RemoteQ, LocalQ> {
  getLocalIssuer() :Issuer<LocalQ>;
  getRemoteIssuer() :Promise<Issuer<RemoteQ>>;
  retain(remoteAmount: Promise<Amount<RemoteQ>>,
         remotePaymentP: Promise<Payment<RemoteQ>>,
         name: G<String>) :Payment<LocalQ>;
  redeem(localAmount: G<Amount<LocalQ>>,
         localPayment: G<Payment<LocalQ>>,
         name: G<String>) :Promise<Payment<RemoteQ>>;
}
makePeg<LQ, RQ>(E,
                remoteIssuerP: G<Promise<Issuer<RQ>>>,
                makeAssay :(Label<LQ> -> Assay<LQ>)) ::Peg<LQ, RQ>;

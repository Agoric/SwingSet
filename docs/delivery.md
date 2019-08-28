
A walkthrough of how messages are passed from one Vat to another.

Each SwingSet machine contains one or more Vats, all talking to a shared
Kernel (and *not* directly to each other). Most Vats are isolated and can
*only* talk to the kernel. Vats correspond to userspace processes in a unix
system, and the SwingSet kernel is very much like the unix kernel which
supports those processes.

Vats contain some application-specific code (named "Vat Code"), which
corresponds to the unix program written in C or some other language. For
SwingSet, most Vat Code is in the SES subset of Javascript, using orthogonal
persistence, native platform Promises, and making eventual-send calls to
local or remote objects with either the `E()` wrapper `p=E(x).foo(args)` or
(eventually) the infix-bang syntax `p=x!foo(args)`. Other forms of Vat Code
could exist, such as non-orthogonal (database/ORM-based) persistence, or in a
non-SES language (e.g. a WASM box).

Below the Vat Code, but still inside the Vat, there is a support layer which
translates eventual-sends into kernel syscalls, and manages persistence. This
corresponds to the `libc` layer in a unix process: user code does not invoke
syscalls directly, but instead it calls standard library functions like
`write()` which wrap those syscalls.

When the vat needs to send a message of some sort, it invokes one of the
kernel's `syscall` functions (the vat receives a `syscall` object with three
methods). To ensure that Vats are isolated from the kernel, and to build a
deterministic transcript, these syscalls are limited to taking pure data as
arguments (i.e. everything could be JSON serialized into a single string,
without loss of correctness). The primary syscall is named `syscall.send()`.

Each Vat turn is initiated by the kernel invoking a `dispatch` function: the
Vat is defined by a `dispatch` object with two or three methods, which all
close over the vat's internal state. The primary one is `dispatch.deliver()`,
which delivers the messages produced by some other vat when it does
`syscall.send()`. The arguments to `deliver` are also pure data, and are
recorded in a transcript to enable replay-based orthogonal persistence.

To enable transactional commitments, the syscalls do not return any data.
During the turn, the kernel records the syscall name and arguments in a
queue, but does not execute them (no kernel state is modified during a turn).
Turns might fail because of a fatal error (e.g. addressing a non-existent
object or promise, or resolving a promise that is supposed to be decided by
some other vat), or the turn might be interrupted by an out-of-gas error (in
which case it could be replayed or restarted after a Keeper supplies more
funds). If/when the turn completes successfully, the queued syscalls are
executed and committed as an atomic set.

All `dispatch` functions can schedule near-term work by using
`Promise.resolve()` to append something to the promise queue. This work will
be completed after the current stack unwinds, but before the turn completes
and the `dispatch` is retired. This allows Vats to use eventual-send
internally, to protect against plan-interference hazards. The kernel waits
for a `setImmediate` on the timer/IO queue before proceeding to the next
message, giving these promise-queue actions a chance to complete.

```
+-- Vat A ---+    +- Vat B --+      +- Vat C --+
|            |    |          |      |          |
|    vat     |    |   vat    |      |   vat    |
|    code    |    |   code   |      |   code   |
|            |    |          |      |          |
|            |    |          |      |          |
|  --------  |    | -------- |      | -------- |
|            |    |          |      |          |
|  support   |    | support  |      | support  |
|   layer    |    |  layer   |      |  layer   |
| |       ^  |    |          |      |          |
+-syscall | -+    +-syscall--+      +-syscall--+
+-|-dispatch-+----+-dispatch-+------+-dispatch-+---------+
| v       |  |    |          |      |          |         |
|  clists    |    |  clists  |      |  clists  |         |
|            |    |          |      |          |         |
|                                                        |
|                                                   >-v  |
|    run-queue        object-table      event-loop  | |  |
|                     promise-table                 ^-<  |
|                                                        |
+-------------------- Kernel ----------------------------+
```

## Vat Object Types

The `syscall`/`dispatch` API references two kinds of identifiers: `Object`
and `Promise`:

* `Object`: a callable object (the usual notion of "object" in the ocap
  discipline), with methods of various names and private state. These may be
  called a "Presence", or a "pass-by-presence" object in some contexts.
* `Promise`: a placeholder for a value which will be determined later

These Object/Promise identifiers must be handled by the translation layer at
the bottom of each Vat. Upper-layer Vat Code is supposed to be
object-capability -safe, which means it must not be able to forge access to
remote objects by creating new identifiers from nothing. Hence the
upper-layer Vat Code will not generally see these values, as they'll be
wrapped in Presences or platform-native `Promise` objects of some sort, or
stored in a callback function that runs when a platform-native promise is
resolved.

Both identifiers use integer index values to distinguish between different
instances. When the Vat allocates the identifier, it uses a positive integer.
When the kernel does the allocation, the vat gets a negative integer. This
index always points into a Capability List (the "c-list", described below).

In some cases, the kernel (or the vat) will allocate an entry in the c-list
when it receives an index that it has not seen before. In other cases, the
index must already be present in the c-list, otherwise it is an error. In a
final set of cases, the index must *not* yet be in the c-list, and the
received must always allocate an entry upon receipt.

Each Object lives in a specific Vat. The types are named from the perspective
of the Vat: when a Vat references one of its own objects in a syscall, this
is called an Export (exported from the Vat into the Kernel). When a Vat is
told about an object from some other Vat, we call it an Import (imported from
the Kernel into the receiving Vat).

The basic asymmetry of Vats and Kernels enables a single name to be used for
each type, independent of which direction it is being sent. The "Comms Vats",
described later, do not have this asymmetry (two comms vats talking to each
other are peers), so the names used on that interface *do* depend on the
direction of delivery, and we will use different names over there to avoid
confusion.

The "resolution authority" for each unresolved Promise either resides in one
specific Vat (known as the "Decider"), or in a message queued within the
kernel (so there is currently no Decider). The Decider Vat, if any, is the
only one which can resolve that Promise. All other Vats can subscribe to hear
about the resolution, but they cannot control it.

Certain parts of the API expect or provide a `Promise` identifier in a
resolving capacity: this includes the `result` of a Message arriving in a vat
via `dispatch.deliver()`, and the first argument of a `syscall.resolve()`.
These function signatures take a `Promise` identifier, but the Vat must own
the Decider authority for that Promise. Otherwise the Vat will be terminated.

Using Rust syntax to capture the types correctly, the Vat-side API has the
following types:

```
struct ObjectID(i32);
struct PromiseID(i32);
enum CapSlot {
    Promise(PromiseID),
    Object(ObjectID),
}
struct CapData {
    body: Vec<u8>,
    slots: Vec<CapSlot>,
}
struct Message {
    method: String,
    args: CapData,
    result: Option<PromiseID>,
}
enum Resolution {
    Fulfill(ObjectID),
    Forward(PromiseID),
    Data(CapData),
    Reject(CapData),
}
```

## Kernel Object Types

For each Vat type, there is a matching kernel type. These are distinct
values, with conversion from one to the other happening at the
syscall/dispatch boundary. Some values are identical (the `body` string is
left untouched), but the object/promise identifiers must be mapped through
the clist tables. The kernel's `ObjectID(5)` may refer to a completely
different object than Vat A's `ObjectID(5)`. Keeping them in different types
helps avoid mistakes. (And note that Vat A's `ObjectID(5)` is probably
unrelated to Vat B's `ObjectID(5)`).

The kernel maintains two tables of the identifiers that appear in Vat
syscalls: one for Objects (Presences), and a second for Promises. Each table
is indexed by a kernel-allocated integer. The rows have types named
`KernelObject` and `KernelPromise`, so the keys are named `KernelObjectID`
and `KernelPromiseID`. These keys are positive integers: all Objects come
from some Vat, and all Promises are managed by the kernel, so from within the
kernel, there is no notion of import-vs-export.

Each row of the kernel Object table remembers the VatID of the owner of that
object: the one which first exported it into the kernel in the argument of a
`syscall.send` or `syscall.resolve`. Messages sent to this object from other
Vats (via `syscall.send`) must be routed to the owning Vat and delivered with
a `dispatch.deliver`.

Each row of the kernel Promise table remembers the current promise state and
any related data. The state is nominally one of the following, however we may
be able to optimize away some of them (e.g. by rewriting data in other
tables):

* `Unresolved`: includes an optional Decider VatID and a list of subscribers
  (VatIDs)
* there are four Resolved states:
* `Fulfilled`: state is an ObjectID (an Export)
* `Data`: state is the resolution data
* `Rejected`: state is the rejection data (maybe an Error object)
* `Forwarded`: state is the `KernelPromiseID` to which it was forwarded

The kernel also maintains a "run-queue", which is populated with pending
deliveries, each of which references a variety of kernel-side objects.

Finally, the kernel maintains c-list (Capability List) tables for each Vat,
which maps vat-side references into kernel Object/Promise references. For
each vat, it has two bidirectional tables: Imports and Exports both map to
the kernel Object table, and Promise/Resolver IDs map to the kernel Promise
table.

```
struct VatID(u32);

struct KernelObjectID(u32);
struct KernelPromiseID(u32);

struct KernelObject {
    owner: VatID,
}
struct KernelObjectTable {
    objects: HashMap<KernelObjectID, KernelObject>,
    next_id: u32,
}

// the kernel has types like Message, CapData, and CapSlot, which
// correspond to Vat types with the same names

enum KernelPromise {
    Unresolved {
        subscribers: Vec<VatID>,
        decider: Option<VatID>,
        queued_messages: Vec<Message>,
    }
    FulfilledToTarget(KernelObjectID),
    FulfilledToData(CapData),
    Rejected(CapData),
}

struct KernelPromiseTable {
    promises: HashMap<KernelPromiseID, KernelPromise>
    next_id: u32,
}

// these two are the same as the Vat's ObjectID/PromiseID
struct VatPromiseID(i32);
struct VatObjectID(i32);

struct VatCList {
    objects: HashMap<VatObjectID, KernelObjectID>,
    next_object_id: u32,
    promises: HashMap<VatPromiseID, KernelPromiseID>,
    next_promise_id: u32,
}

struct VatData {
    clists: VatCList,
    pipeline: bool,
}

struct KernelCLists {
    vats: HashMap<VatID, VatData>,
}
```

`KernelObject` and `KernelPromise` rows are retained as long as they are
referenced by any Vat C-Lists, any `CapData` structures or `Resolution`
targets in the Promise table, or any target/data/result in the run-queue.
When the last reference is removed, the row can be deleted. The ID could also
be recycled, but it seems less confusing to simply retire the number.


## Vat Message Types

We use the term `CapData` to mean a piece of data that can include capability
references. Each reference is known as a `CapSlot`. The data is serialized
into our [augmented form of JSON](https://github.com/agoric/marshal), which
uses special `@qclass` keys to represent things not normally expressible by
JSON (such as `NaN`, `-0`, `Infinity`, `undefined`, bigints, and `CapSlot`
references). Each appearance of a `CapSlot` causes a Vat object (`Import`,
`Export`, or `Promise`) to be added to a list named `slots`, and a reference
to the new slot index gets inserted into the JSONified data structure . The
serialized `CapData` thus consists of the JSON-encoded string (named `body`)
and the list of slots (named `slots`). As this `CapData` travels from one
Vat, into the kernel, and off to some other vat, the `body` remains
untouched, but the `slots` are remapped at each vat/kernel boundary.

A `Message` is the method invocation first given to `syscall.send` for
transmission to some other Vat, then stored in the kernel run-queue, then
finally arrives at the target vat inside a `dispatch.deliver` call. The
Message includes the method name which should be invoked, the `CapData`
arguments to be included, and an optional result identifier (a Promise). The
SwingSet calling model has only positional (not keyword) arguments, hence the
`CapData.body` always deserializes to an array.

The Message does not include the target, since that changes over time (it
might be sent first to an unresolved Promise, then queued on the decider Vat,
then that Promise might get forwarded to some other promise, etc). The
Message includes the result identifier because it remains tied to the Message
even as it gets queued and forwarded from one place to another.

## Result Promise Management

The Vat Message `result` identifier, if present, must refer to a Promise for
which the sending Vat has resolution authority. There are three
possibilities, and `syscall.send` will reject the message (terminating the
Vat) unless the `result` ID falls into one of these categories:

* A brand new Promise was created just for the result slot. The ID will be a
  positive integer that is not already in the c-list.
* The Promise was created by this Vat earlier, and it has never been used as
  a result or a resolution. The ID will be a positive integer that is already
  present in the c-list, and the Decider will point at this Vat.
* The Promise was received from the kernel earlier as the result slot of an
  incoming message. The ID will be a negative integer, and the Decider will
  point at this Vat.

In all cases, the kernel promise table winds up with a Promise for which the
Decider is cleared, as the resolution authority now resides in the queued
message. When the message gets to the front of the queue and is delivered to
some Vat, the Decider is changed to point at that Vat. If that Vat sends the
Promise back into the kernel as the result slot of some further message, the
Decider is cleared again. If the Vat resolves the Promise instead, the state
changes to `Resolved` and the resolution authority has been consumed.

The only way to shed resolution authority is to either put the promise ID
into the result slot of an outbound message (which transfers the authority to
the run queue, and sets `Decider` to `None`), or to consume it by using the
ID in a `syscall.resolve()`. The only way to acquire resolution authority is
to either create a new Promise (by passing the kernel a new positive
`PromiseID`, inside a `CapData` slot), or to receive it in the result slot of
an inbound message.

### Pipelining

Promise Pipelining is the practice of sending one message to the Decider of
the Promise that came back from the transmission of an earlier message. It is
a vital latency-reduction tool for sending multiple messages to a distant
machine.

In SwingSet, pipelining is most (only?) useful on the Comms Vat. The local
kernel shares a host with the local vats, so the latency is minimal. However
two messages aimed at the same remote machine, through the Comms Vat, would
suffer unnecessary roundtrips unless the second can be delivered earlier. So
each Vat, when it is added, can include an option flag that says "I want to
received pipelined messages early". The default, used by everything except
the Comms Vat, means "I want the kernel to queue those messages, not me".

(open question: another option would be for `dispatch.deliver()` to return a
special value that means "kernel please queue this for me instead")

When a message that targets an unresolved promise comes to the front of the
run-queue, the Decider is examined. If the deciding vat has opted in to
pipelined deliveries, `dispatch.deliver()` is invoked and the message is sent
into the deciding Vat, which is obligated to queue them inside the Vat until
the target is resolved. When that resolution happens, the new target might be
in some other Vat, in which case the deciding Vat must re-submit all those
messages back into the kernel. Vats may prefer to avoid deserializing the
messages until their resolution is known, to avoid a wasteful reserialization
cycle.

If the deciding Vat has *not* opted into pipelining, the messages are queued
in the kernel's Promise Table entry instead. They remain there until the
deciding vat uses `syscall.resolve()` to resolve that Promise. At that point,
the behavior depends upon the type of resolution; see the discussion of
`syscall.resolve()` below for details.

When the initial pair of messages are submitted with `syscall.send()`, the
run-queue will have two pending deliveries: the first is targeting an object
in some Vat, and the second targets a Promise. Until the first message is
delivered, the result Promise has no Decider, so the second message cannot be
delivered. But that's ok, because by the time the second message gets to the
front of the run queue, the first will have been delivered, setting the
Decider of the result Promise to some vat, providing a place to deliver the
second one (or the knowledge that the vat wants the kernel to queue it
instead).

When we implement Flows or escalators or some other priority mechanism, we
must ensure that we don't try to deliver any message until all its
dependencies (including the target) have been resolved to some particular
vat. A pipelining vat would learn (and probably be able to use) the Meter
attached to the pipelined messages, whereas if these messages are queued in
the kernel, the decider vat would not get access to those Meters.

### Result Promise Summary

* Allocating a new Promise in `CapData` creates resolution authority, sending
  the Promise in `.result` gives it away, getting a Promise in
  `.result` acquires it, and using the Promise in `resolve()` consumes it.
* The kernel will clear the Decider of the Promise while the message sits on
  the run-queue.
* If the inbound Message has a `result`, the receiving Vat will be the
  Decider for the corresponding Promise.

When a pipelining-aware Vat resolves a Promise, and then forwards the
previously queued messages which it received before that resolution, it can
return the Message objects unchanged back into the kernel (with
`syscall.send`), keeping the `result` identifiers exactly the same.

## Descriptive Conventions

The Objects and Promises are represented in debug logs with a single-letter
prefix (`o` or `p`), a sign, and a number. They also include a Vat ID prefix
(`vNN.`). So when Vat 2 does a `syscall.send` that targets an import (a
kernel-allocated Object identifier, hence negative), and includes an argument
which is a local object (an export, hence positive), and specifies a result
that is a new local Promise, the logs might say `v2.send(target=o-4,
msg={name: foo, slots:[o+3], result=p+5})`. The Promise that results from
this `send` is also labelled `p+5`.

The kernel types use `ko` and `kp`. The run-queue for that message would be
printed as `target=ko6, msg={name: foo, slots:[ko2], result=kp8}`.

The Comms Vat creates inter-machine messages that refer to Objects and
Promises in per-remote-machine C-List tables that live inside each Comms Vat.
These identifiers use `ro` and `rp` as prefixes.

The Javascript SwingSet implementation uses these actual strings as keys in
the arguments and the C-list tables. In other languages, they could be
represented by a tagged union whose only real member is an integer.

Each Vat's numberspace is independent (so "1" could nominally be allocated in
each space, with different meanings). To avoid confusion, we start each Vat's
numberspace with a different offset (1000 times the vat number).


## Kernel-Side C-Lists

For each Vat, the Kernel maintains a set of Capability-List structures
(c-lists), which translate between vat-side identifiers and kernel-side
identifiers. Depending upon the operation, this translation might insist that
the value is already present in the table, insist that it *not* already be
present, or it might allocate a new slot when necessary.

C-lists map Vat objects to kernel objects. After Vat 2 sends this message
into the kernel .. :

```
v2.send(target=o-4, msg={name: foo, slots:[o+3], result=p+5})
```

.. the Vat-2 clist might contain:

| Vat 2 object | Kernel object | Allocator | Decider |
| ---          | ---           | ---       | ---     |
| `o-4`        | `ko6`         | v3        | N/A     |
| `o+3`        | `ko2`         | v2        | N/A     |
| `p+5`        | `kp8`         |           | none    |

## Syscall/Dispatch API

The full API (using Rust syntax to capture the types correctly) is:
```
trait Syscall {
    fn send(target: CapSlot, msg: Message);
    fn subscribe(id: PromiseID);
    fn resolve(subject: PromiseID, to: Resolution);
}
 
trait Dispatch {
    fn deliver(target: CapSlot, msg: Message);
    fn notify(subject: PromiseID, to: Resolution);
}
```

There are a few restrictions on the API:

* The kernel will never send messages to the wrong place: the `target=` in a
  `dispatch.deliver()` will always be owned by the receiving Vat (either an
  ObjectID allocated by this Vat, or a PromiseID for which this Vat is the
  Decider).
* The `Message.result` in a `syscall.send` must either be a new vat-allocated
  (positive) PromiseID, or a previously-allocated PromiseID for which the
  calling Vat is the Decider, or a PromiseID that was previously received as
  the result of an inbound message.

Some invocation patterns are legal, but unlikely to be useful:

* `syscall.send(target=)` can be any `CapSlot`, however it is a bit silly to
  reference an Object that lives on the local Vat, or a Promise for which the
  local Vat is the Decider. In both cases, the Vat could have delivered the
  message directly, instead of taking the time and effort of going through
  the kernel's run-queue. On the other hand, this may achieve certain
  ordering properties better.


## Outbound (Vat->Kernel) translation

Inside the implementations of all syscall methods (`send` and `resolve`), the
Vat-specific argument slots are first mapped into kernel-space identifiers by
passing them through the Vat's c-list tables. If the Vat identifier is
already present in the table, the corresponding kernel identifier is used. If
it is not already present, the behavior depends upon which method and
argument it appeared in, as well as the category of identifier.

This section describes the mapping rules for all API slots. If the mapping
signals an error, the sending vat is terminated, as there is no sensible
recovery from mapping errors.


### syscall.send()

The target of a `syscall.send()` specifies where the message should be sent.
`Object` always maps to a `KernelObject`, and `Promise` always maps to a
`KernelPromise`. If the Vat object is not already in the c-list, the
following table describes what the mapping function does:

| Vat Object         | description    | action if missing                 |
| ---                | ---            | ---                               |
| `Object (ID > 0)`  | Export         | allocate KernelObject (loopback)  |
| `Object (ID < 0)`  | Import         | error                             |
| `Promise (ID > 0)` | local promise  | allocate KernelPromise (loopback) |
| `Promise (ID < 0)` | remote promise | error                             |

Any `CapSlot` objects inside `Message.args` are translated the same way.
Unlike `target=`, it is extremely common to include `args` that point at
Exports and local Promises. In either case, if a `KernelPromise` is
allocated, its Decider is set to point at the allocating vat.

The `Message.result`, if present, must be a `PromiseID`, and will always map
to a `KernelPromise`:

| Vat Object         | description     | action if missing      |
| ---                | ---             | ---                    |
| `Promise (ID > 0)` | Send Result     | allocate KernelPromise |
| `Promise (ID < 0)` | Dispatch Result | error                  |

In addition, if the `KernelPromise` already exists, its Decider must point at
the Vat which invoked `syscall.send()`, or an error is thrown. The
`KernelPromise` decider field is cleared (set to `None`), because the message
itself now owns the resolution authority, not the sending vat.

After mapping, the `send` is pushed onto the back of the kernel's run-queue.
Later, when this operation comes to the front, the kernel figures out how it
should be dispatched based upon the target (object or promise) and its
current state:

| Target  | State      | action                                       |
| ---     | ---        | ---                                          |
| Object  | n/a        | deliver to owning Vat                        |
| Promise | Unresolved | deliver to Decider Vat                       |
| Promise | Fulfilled  | look up fulfilled object                     |
| Promise | Forward    | look up forwarded promise                    |
| Promise | Data       | queue `CannotSendToData` rejection to result |
| Promise | Rejected   | queue rejection data to result               |

The state of a Promise might change (from Unresolved to some flavor of
Resolved) between the message being placed on the queue and it finally being
delivered, but it should always be the case that by the time delivery occurs,
the Promise has a known Decider.

As an optimization, when a Promise is fulfilled or forwarded, the kernel
could walk the run-queue and rewrite the targets of those pending deliveries.
This might enable the Promise entries to be removed earlier, and/or remove
some states from the table entirely.

### syscall.subscribe()

Vats which receive a Promise (e.g. in `CapData`) might use it as the target
for message sends, or they might be interested in when and how it resolves,
or both. To reduce the noise of unwanted notifications, Vats will not receive
a `dispatch.notify()` for a Promise unless they first use
`syscall.subscribe()` to express their interest.

The `PromiseID` argument to `subscribe()` is translated through the c-list
just like a `CapSlot` in `syscall.send()`. It is not common for this to cause
the allocation of a `KernelPromise`, because Vats don't usually subscribe to
hear about their own Promises, but it is legal.

### syscall.resolve()

The subject of a `syscall.resolve` must be a Promise ID that already exists,
and for which the calling Vat is the Decider. The `KernelPromise` must be in
the `Unresolved` state. If any of these conditions are not met, the Vat
calling `resolve` will be terminated.

It doesn't matter whether the resolver was allocated by this Vat (rare) or a
different one (more common).

| Vat Object         | description     | action if missing |
| ---                | ---             | ---               |
| `Promise (ID > 0)` | Send Result     | error             |
| `Promise (ID < 0)` | Dispatch Result | error             |

The `resolution` has several forms, and we assign a different name to each.

* `Fulfill(ObjectID)`: the Promise is said to be "fulfilled" (to an Object),
  and queued messages should be delivered to that Object
* `Forward(PromiseID)`: the Promise is now said to be "forwarded": it has not
  settled to a specific object, but the original Promise is effectively
  replaced with some other Promise. Queued messages are re-processed
  according to the state of the new Promise.
* `Data(CapData)`: the Promise is said to be "fulfilled" (to data). It is an
  error to send messages to data, so any `result` promises in the queued
  messages should be rejected with a `CannotSendToData` object
* `Reject(CapData)`: the Promise is said to be "rejected". Any `result`
  promises in the queued messages should be rejected with the same `CapData`
  provided as `resolution`.

As the `syscall.resolve()` is processed by the kernel, all slots in the
`resolution` should be mapped just like the `Message` slots in
`syscall.send`. If the resolution is `Forward`, the new promise must be
different than the one being resolved, and must not result in a cycle. (TODO
could one Vat force a second one into unknowingly creating a cycle?).

After mapping, the kernel processing `resolve()` modifies the kernel Promise
table to store the resolution (which clears the Decider pointer, because only
`Unresolved` promises have a Decider), and it queues `notify_resolved`
messages for all `subscribers`. If the Promise table holds any queued
messages, these must be dispatched according to the resolution type:

* `FulfilledToTarget`: Re-queue all Messages to the new target object. The
  new `PendingDelivery`s are appended to the back of the run-queue.
* `Forwarded`: All messages are re-queued to the new target promise. When
  they get to the front, they may be delivered to the deciding vat (if it has
  opted-in to pipelining) or queued in the Promise Table entry.
* `FulfilledToData`: the queued Messages are discarded, however if they have a
  `result` promise, a `CannotSendToData` error object is created, and new
  Messages are queued to the result promises.
* `Rejected`: the Message is discarded, but a copy of the rejection data is
  queued in a new Message to any `result` promises that were present

(todo: think about the ordering properties of the potential approaches)

As an important performance optimization, the old now-Resolved Promise is now
removed from the resolving Vat's C-List table. The Vat knows what it was
resolved to, so it should never need to refer to it again in the future. If
the higher-layer vat code still retains the original native Promise and
includes it in an argument, the lower-level translation layer can create a
new promptly-resolved Promise for it.

(TODO: `resolve()` is a good opportunity to remove the promise from the
resolving vat's c-list, however if we have queued messages, it must live long
enough to forward those messages to the new resolution. It would be nice to
keep the CannotSendToData logic in the kernel, and have the resolving Vat
just re-`send` everything in the queue in all resolution cases. If it
fulfills to an Export, would the extra queue delay violate our ordering
goals?)

* `Fulfill(ObjectID)`: the Promise is said to be "fulfilled" (to an Object).
  After calling `resolve()`, the Vat doing the fulfillment should then call
  `syscall.send()` with any messages that it had queued for this Promise.
* `Forward(PromiseID)`: the Promise is now said to be "forwarded": it has not
  settled to a specific object, but the original Promise is effectively
  replaced with some other Promise. The Vat should `syscall.send()` any
  queued messages, because the new Promise might be on a different Vat
  entirely.
* `Data(CapData)`: the Promise is said to be "fulfilled" (to data). We cannot
  sent messages to data, so any queued messages should be rejected with a
  CannotSendToData error object (which can include the `CapData` for
  debugging).
* `Reject(CapData)`: the Promise is said to be "rejected". Any queued
  messages should be rejected with the `CapData` provided as `resolution`.

Finally, the kernel returns control to the Vat. If this vat had opted-in to
pipelining, it may have internally queued messages for the Promise it just
resolved. The Vat should now redeliver those messages. Depending upon the
resolution type, that may do:

* fulfill to Import or remote Promise: `syscall.send` calls
* fulfill to Data or rejection: `syscall.resolve()` calls on the results
* fulfill to local Object (Export): local message delivery
* forward to local Promise: local requeueing

(TODO: instead, we could have the kernel deal with everything. We'd give
`resolve()` a third argument, a list of `Message` objects. `resolve()` would
update the kernel promise table with the resolution, feed all the Messages
through the `syscall.send()` path, then finally delete the C-List entry. The
kernel would be responsible for generating the CannotSendToData errors. This
would be simpler for the Vats, but Dean thinks it would cause problems. At
the very least, the choices affect ordering.)

## Kernel Run-Queue

The Kernel's run-queue holds two kinds of pending operations: `Send`
(enqueued when a Vat does `syscall.send()`), and `Notify` (enqueued when one
does `syscall.resolve`).

```
enum KernelSlot {
    Object(KernelObjectID),
    Promise(KernelPromiseID),
}
enum PendingOperation {
    Send {
        target: KernelSlot,
        message: KernelMessage,
    }
    Notify {
        subscriber: VatID,
        subject: KernelPromiseID,
    }
}
struct KernelRunQueue {
    queue: VecDeque<PendingOperation>,
}
```

When a `Send` or `Notify` reaches the front of the run-queue, the kernel must
figure out how to act upon the delivery. The simple cases are a `Send` to an
Object, which always causes a `dispatch.deliver()` to the owning Vat, and
`Notify`, which always performs a `dispatch.notify()` to the given
subscriber.

If the `Send` is to a Promise, the action depends upon the state of the
promise:

| State      | Action                                        |
| ---        | ---                                           |
| Unresolved | queue, or deliver() to decider vat of promise |
| Forwarded  | process according to target Promise           |
| Fulfilled  | deliver() to owner of fulfillment object      |
| Data       | resolve result to error                       |
| Rejected   | resolve result to error                       |

If the Promise is `Unresolved`, the kernel looks at its `Decider` field, and
sees if the named Vat has opted in to pipelining or not. If so, it does a
`dispatch.deliver()` to the named Vat. If not, the message is queued inside
the kernel Promise object.

If it is `Fulfilled` (to an object), the kernel acts as if the `Send` was to
the object itself. As a performance optimization, when a Promise is fulfilled
this way, the kernel could rewrite the run-queue to replace the `target`
fields with the object, and this case would never be encountered.

If the Promise has been fulfilled to data (which is not callable), or
explicitly rejected, the original message is discarded, as there is nobody to
accept it. However if the message requested a `result`, that result Promise
must be rejected, just as if decider Vat had called
`syscall.resolve(Reject(error))`. The rejection error is either a
`CannotSendToData` object (for `Data`), or a copy of the Promise's own
rejection object (for `Rejected`).

## Inbound (Kernel->Vat) translation

Any slots in the operation must then be translated into identifiers that are
specific to the target Vat, by looking them up in the target Vat's C-List. If
they do not already exist in this C-List, the allocation behavior will depend
upon which Vat owns/allocated the kernel slot.

### dispatch.deliver()

The target argument of `dispatch.deliver()` specifies which Object (or
Promise) should get the message.

| Kernel Slot | Owner          | Name           | action if missing | Vat Slot         |
| ---         | ---            | ---            | ---               | ---              |
| Object      | same as target | Export         | error             | Object (ID > 0)  |
| Object      | different      | Import         | allocate          | Object (ID < 0)  |
| Promise     | different      | remote promise | allocate          | Promise (ID < 0) |
| Promise     | same as target | local promise  | error             | Promise (ID > 0) |

Any `CapSlot` objects inside `Message.args` are translated the same way.

The `Message.result`, if present, is always translated into a `PromiseID`:

| Kernel Slot | Owner          | Name            | action if missing | Vat Slot         |
| ---         | ---            | ---             | ---               | ---              |
| Promise     | same as target | Send Result     | error             | Promise (ID > 0) |
| Promise     | different      | Dispatch Result | allocate          | Promise (ID < 0) |

### no dispatch.subscribe()

Vats are obligated to notify the kernel (via `syscall.resolve()`) about the
resolution of all Promises for which they are the Decider. The kernel promise
tables need to be updated even if no other Vats have subscribed. As a result,
there is no `dispatch.subscribe()` in the API.

### dispatch.notify()

The `subject` argument of `dispatch.notify()` specifies which Promise is
being resolved. It is always translated into a `PromiseID`.

| Kernel Slot | Owner          | Name           | action if missing | Vat Slot         |
| ---         | ---            | ---            | ---               | ---              |
| Promise     | same as target | Local Promise  | error             | Promise (ID > 0) |
| Promise     | different      | Remote Promise | allocate          | Promise (ID < 0) |

`dispatch.notify()` will be sent to all Vats which had subscribed to hear
about the resolution of that Promise. The Decider vat for a Promise will not
generally subscribe themselves, since they are the ones causing the Promise
to become resolved, so they have no need to hear about it from the kernel.

The `Resolution` value of `dispatch.notify()` may contain slots, which are
translated just like `Message.args`.

TODO: After a Vat receives notice of a Promise being resolved, we might
choose to remove that promise from the vat's c-list, and forbid the Vat from
ever mentioning that promise again.

A Vat might be informed that one Promise has been resolved to another Promise
(`Resolution::Forward`). This new Promise might be local, or imported.

## Sample Message Delivery

This section follows a variety of messages are they are sent from Vat-1 to
Vat-2.

### no arguments, resolve to data

The initial conditions are that Vat-1 somehow has a reference to an export of
Vat-2 that we'll name `bob`.

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
* Kernel Promise Table: empty
* Kernel run-queue: empty
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)

Vat-1 does `p1 = bob!foo()`. This causes the lower layers of Bob's vat to
allocate a new local promise/resolver ID (for the result `p1`), say it
chooses `104`, and then invokes `syscall.send(target=o-1001, msg={method:
"foo", args: "[]", slots=[], result=p+104})`. Vat-1 remembers `p+104` as the
identifier for the result Promise. We assume that Vat-1 uses `p1` later (i.e.
`p1.then(stuff..)`), so it also does a `syscall.subscribe(p+104)`.


```
+-- Vat 1 ---+   +- Vat 2 --+      +- Vat 3 --+
|            |   |          |      |          |
|p1=bob!foo()|   |   vat    |      |   vat    |
|            |   |   code   |      |   code   |
|            |   |          |      |          |
|            |   |          |      |          |
| ---------- |   | -------- |      | -------- |
|            |   |          |      |          |
|  send()    |   | deliver  |      | support  |
|    |       |   |   ^      |      |  layer   |
|    |       |   |   |      |      |          |
+----|-------+   +---|------+      +-syscall--+
+----|-------+---+---|------+------+-dispatch-+-------+
|    v       |   |   |      |      |          |       |
|  clists    |   |  clists  |      |  clists  |       |
|    |       |   |   ^      |      |          |       |
|    |               |                                |
|    |               |                            >-v |
|    \-> run-queue --/  object-table   event-loop | | |
|                       promise-table             ^-< |
|                                                     |
+------------------- Kernel --------------------------+
```

The `syscall.send()` is mapped into the kernel through the Vat-1 C-List. The
target is translated to `ko1`, which is looked up in the kernel object table
to learn that the target is in `vat-2`. There are no arguments, so there are
no `VatSlots` to be translated. The `result` (`p+104`) is not present in the
C-List, so a new `KernelPromise` entry is allocated (say `kp24`), and the
Decider is set to None since it is being allocated in the context of a
`send()`'s `.result` field.

The `Pending Send` is appended to the run-queue.

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: None, subscribers: [])`
* Kernel run-queue:
  * `Send(target: ko1, message: {.. result=kp24})`
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of result promise)

The `syscall.subscribe(p+104)` causes the PromiseID to be looked up in the
kernel promise table, yielding `kp24`. Vat-1 is then added to the
`subscribers` list.

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`

The run-queue is cycled, and this Send comes to the top. This looks up
`target` in the kernel object table to find the owner (`vat-2`), which
indicates the c-list to use for translating the message.

The target `ko1` is looked up in the Vat-2 C-List, and maps to `v2.o+2001`.
As a target, it must already be present in that C-List (the kernel will never
send a message to the wrong place). There are no arguments, so no `VatSlots`
to be translated. The `result` (`kp24`) is not present in the C-List, and its
owner (Vat-1) is different than the target (Vat-2), so a new entry is
allocated, and the vat gets `v2.p-2105`. The Decider for `kp24` is set to
`vat-2` because we're about to deliver the message to Vat-2.

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of result)

and Vat-2 receives a `dispatch.deliver(target=o+2001, msg={method: "foo",
args: "[]", slots=[], result=p-2015})`.

In the vat code on Vat-2, the `foo()` method returns some basic data "42".
This causes Vat-2 to resolve the promise to data, by calling
`dispatch.resolve(subject=p-2015, resolution=Data(body="42", slots=[]))`.

The kernel translates the subject (`p-2015`, in its resolution capacity)
through the calling vat's C-List into `kp24`. It confirms in the kernel
promise table that `kp24` is in the `Unresolved` state and that Vat-2 is the
Decider, so the `resolve()` is allowed to proceed. The subscribers
(`[vat-1]`) are stored for later.

The resolution body has no slots, so translating it is trivial. The
subscribers kernel promise table is then updated to reflect the resolution:

  * `kp24: state: Resolved(data(body="42", slots=[]))`

The kernel then pushes notifications to all subscribers (just Vat-1) onto the
run-queue:

* Kernel run-queue:
  * `Notify(subscriber: vat-1, subject: kp24)`

The `dispatch.resolve()` returns, and Vat-2 finishes its turn.

The run-queue is then cycled again, and the Notify is at the top. The kernel
uses the `subscriber` to pick the Vat-1 C-List for inbound translation, and
the subject (`kp24`) is translated into `p+104`. The promise table is
consulted for `kp24` to determine the resolution, in this case `Data`. The
resolved data (`42`) has no slots, so translation is trivial. The Vat-1
dispatch function is then invoked as `dispatch.notify(subject: p+104, to:
Data(body="42", slots=[]))`.

Vat-1 looks up `p+104` in its internal tables to find the resolver function
for the native Promise that it created at the beginning, and invokes it with
`42`, firing whatever `.then()` functions were attached to that Promise.

### Pipelined Send

Suppose Vat-1 did `bob!foo()!bar()`, which sends `bar` to the Promise
returned by the initial `bob!foo()`. This is Promise Pipelining, and `bar` is
supposed to be sent into the Vat which owns the result of `bob!foo()` (which
will be the same Vat that owns `bob`, namely Vat-2). Vat-2 has opted into
receiving pipelined messages.

The two `send` calls will look like:

* `syscall.send(target=o-1001, msg={method: "foo", .. result=p+104})`
* `syscall.send(target=p+104, msg={method: "bar", .. result=p+105})`

And after those sends, the kernel state will look like this:

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: None, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Kernel run-queue:
  * `Send(target: ko1, message: {method="foo", .. result=kp24})`
  * `Send(target: kp24, message: {method="bar", .. result=kp25})`
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of foo() result promise)
  * `v1.p+105 <-> kp25` (export of bar() result promise)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)

Vat-2 will get the same `dispatch.deliver(target=o+2001, msg={method: "foo",
args: "[]", slots=[], result=p-2015})` as before, and we'll get these changes
to the kernel state:

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Kernel run-queue:
  * `Send(target: kp24, message: {method="bar", .. result=kp25})`
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)

Then the `bar` message reaches the front of the queue, and the kernel finds
that its target (`kp24`) is in the Unresolved state, and looks up the Decider
(`vat-2`). It sees that `vat-2` accepts pipelined messages, so it delivers
the message to Vat-2, which receives it as `dispatch.deliver(target=p-2015,
msg={method: "bar" .. result=p-2016)`. The kernel state during this call is:

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)
  * `v2.p-2016 <-> kp25` (import of bar() result)

Vat-2 should store this `bar()` Message in a queue for it's `p-2015` Promise.
If Vat-2 is actually a Comms Vat, it could send `bar()` over the wire to the
remote machine where `bob` lives, right away, instead of waiting for `bob` to
resolve.

### Forwarding Queued Messages

Imagine the previous scenario (`bob!foo()!bar()`), but now `bob` resolves the
`foo()` result promise to point at a third object `carol` in Vat-3. The
relevant kernel state looks like:

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
  * `ko2` (carol): owner= vat-3
* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of foo() result promise)
  * `v1.p+105 <-> kp25` (export of bar() result promise)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)
  * `v2.p-2016 <-> kp25` (import of bar() result)
  * `v2.o-2022 <-> ko2` (import of carol)
* Vat-3 C-List:
  * `v3.o+3001 <-> ko2` (export of carol)

Vat-2 does a `syscall.resolve(subject=p-2015, resolution=Fulfill(o-2022))`.
In the Kernel, the subject is mapped to `kp24`, and we check that it is
Unresolved, and that the Decider matches. The resolution is mapped to `ko2`,
and the promise table is updated. The kernel queues notifications to the only
subscriber (Vat-1):

* Kernel Promise Table:
  * `kp24: state: Resolved(fulfill(ko2))`
* Kernel run-queue:
  * `Notify(subscriber: vat-1, subject: kp24)`

Control returns to Vat-2, which now must send all the messages that were
previously queued for the Promise it just resolved. The same Message
structure that came out of `dispatch.notify` is sent unmodified back into
`syscall.send`, but the target is now the resolution of the promise:
`send(target=ko2, msg={method: "bar", .. result=p-2016})`.

* Kernel Promise Table:
  * `kp24: state: Resolved(fulfill(ko2))`
* Kernel run-queue:
  * `Notify(subscriber: vat-1, subject: kp24)`
  * `Send(target: ko2, message: {method="bar", .. result=kp25})`

(TODO: is it necessary/ok/bad that vat-1 sees the Notify before it sees the
queued messages arrive? We could have Vat-2 invoke the syscalls in either
order.)

Vat-1 gets the notify and must map `carol` into a new C-List entry:

* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of foo() result promise)
  * `v1.p+105 <-> kp25` (export of bar() result promise)
  * `v1.o-1002 <-> ko2` (import of carol)

Vat-1 gets `dispatch.notify(p+104, to: Fulfill(o-1002))`.

Then the queued message `bar` is delivered to `carol` in Vat-3, which maps
the result promise into Vat-3's C-List:

* Vat-3 C-List:
  * `v3.o+3001 <-> ko2` (export of carol)
  * `v3.p-3031 <-> kp25` (bar() result promise)

and Vat-3 gets `dispatch.deliver(target=o+3001, message: {method="bar", ..
result=p-3031})`.

### Pipelined send to a non-Comms vat

Now let us suppose Vat-2 has *not* elected to accept pipelined messages (i.e.
it is not the Comms Vat). When Vat-1 does `bob!foo()!bar()`, the `bar` should
be queued inside the kernel Promise, rather than being delivered to Vat-2.

Again, the two `send` calls will look like:

* `syscall.send(target=o-1001, msg={method: "foo", .. result=p+104})`
* `syscall.send(target=p+104, msg={method: "bar", .. result=p+105})`

And after those sends, the kernel state will look like this:

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: None, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Kernel run-queue:
  * `Send(target: ko1, message: {method="foo", .. result=kp24})`
  * `Send(target: kp24, message: {method="bar", .. result=kp25})`
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of foo() result promise)
  * `v1.p+105 <-> kp25` (export of bar() result promise)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)

Vat-2 will get the same `dispatch.deliver(target=o+2001, msg={method: "foo",
args: "[]", slots=[], result=p-2015})` as before, and we'll get these changes
to the kernel state:

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1])`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Kernel run-queue:
  * `Send(target: kp24, message: {method="bar", .. result=kp25})`
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)

Now, when the `bar` message reaches the front of the queue the kernel finds
that its target (`kp24`) is in the Unresolved state, the kernel sees that
`vat-2` does not accept pipelined messages. So instead of a
`dispatch.deliver`, it queues the message within the Promise:

* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: vat-2, subscribers: [vat-1], queue: [{method="bar", ..}])`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)

Later, if the Vat Code inside Vat-2 resolves the Promise to some new exported
object "quux", the lower-level code will call
`syscall.resolve(subject=p-2015, resolution=Fulfill(o+2022))`, and the kernel
will update the Promise table and re-queue the old messages, as well as
scheduling notification for the subscribers:

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
  * `ko3` (quux): owner= vat-2
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of foo() result)
  * `v2.o+2022 <-> ko3` (export of quux)
* Kernel Promise Table:
  * `kp24: state: Resolved(target(ko3))`
  * `kp25: state: Unresolved(decider: None, subscribers: [vat-1])`
* Kernel run-queue:
  * `Notify(subscriber: vat-1, subject: kp24)`
  * `Send(target: ko3, message: {method="bar", .. result=kp25})`

When the Send gets to the front of the queue, it will deliver `bar()` into
vat-2, which marks `kp25` as being decided by vat-2.


### More Arguments, Three Vats

Now let's examine how various arguments are managed. Our initial conditions
give Vat-1 access to a previously-exported object `alice` (in Vat-1), an
import from Vat-2 named `bob` as before, an import from Vat-3 named `carol`,
and a Promise received from Vat-2 named `p2`. We're going to send all of
these, plus a local Promise, to `carol`.

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
  * `ko2` (carol): owner= vat-3
  * `ko3` (alice): owner= vat-1
* Kernel Promise Table:
  * `kp22: state: Unresolved(decider: vat-2, subscribers: [vat-1])` (p2)
* Kernel run-queue: empty
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.o-1002 <-> ko2` (import of carol)
  * `v1.o+1044 <-> ko3` (export of alice)
  * `v1.p-1052 <-> kp22` (import of p2)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
* Vat-3 C-List:
  * `v3.o+3001 <-> ko2` (export of carol)

Vat-1 now does `p3 = make_promise(); p4 = carol!foo(alice, bob, carol, p2, p3)`.

The `make_promise()` creates a regular Vat-Code promise (a native Javascript
Promise). Nothing special happens until the `foo()` is processed into a
`syscall.send`. During that processing, as the `p3` argument is serialized,
the translation layer in Vat-1 allocates a new local PromiseID for it (say
`p+103`). It allocates `p+104` for the result (p4). The resulting syscall is
`send(target=o-1002, msg={method: "foo", args: "..", slots=[o+1044, o-1001,
o-1002, p-1052, p+103], result=p+104})`. The kernel state now looks like:

* Kernel Object Table:
  * `ko1` (bob): owner= vat-2
  * `ko2` (carol): owner= vat-3
  * `ko3` (alice): owner= vat-1
* Kernel Promise Table:
  * `kp22: state: Unresolved(decider: vat-2, subscribers: [vat-1])` (p2)
  * `kp23: state: Unresolved(decider: vat-2, subscribers: [])` (p3)
  * `kp24: state: Unresolved(decider: None, subscribers: [vat-1])` (p4)
* Kernel run-queue:
  * `Send(target=ko2, msg={method: "foo", args: "..", slots=[ko3, ko1, ko2, kp22, kp23], result=kp24})`
* Vat-1 C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.o-1002 <-> ko2` (import of carol)
  * `v1.o+1044 <-> ko3` (export of alice)
  * `v1.p-1052 <-> kp22` (import of p2)
  * `v1.p+103 <-> kp23` (export of p3)
  * `v1.p+104 <-> kp24` (result p4)
* Vat-2 C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p+2002 <-> kp22` (previously exported p2)
* Vat-3 C-List:
  * `v3.o+3001 <-> ko2` (export of carol)

The run-queue is cycled, and `foo` comes to the top. The target is `ko2`,
which is owned by vat-3. The inbound target must already exist in the map,
and gets `v2.o+3001`. The inbound `ko3` is not already present in the Vat-3
C-List, so we allocate `v3.o-3031`. The same is true for inbound `ko1`, which
gets `v3.o-3032`. The inbound `ko2` is already present (we're sending `carol`
a reference to herself, so `ko2` is coming back home), so it is mapped to
`v3.o+3001`. The inbound `kp22` gets a new import `v3.p-3041`, as does `kp23`
mapping to `v3.p-3042`. Finally the result `kp24` is mapped to `v3.p-3043`
and its Decider is pointed at vat-3. The resulting state, just before
dispatch, is:

* Kernel Promise Table:
  * `kp22: state: Unresolved(decider: vat-2, subscribers: [vat-1])` (p2)
  * `kp23: state: Unresolved(decider: vat-2, subscribers: [])` (p3)
  * `kp24: state: Unresolved(decider: vat-3, subscribers: [vat-1])` (p4)
* Vat-3 C-List:
  * `v3.o+3001 <-> ko2` (export of carol)
  * `v3.o-3031 <-> ko3` (import of alice)
  * `v3.o-3032 <-> ko1` (import of bob)
  * `v3.p-3041 <-> kp22` (import of p2)
  * `v3.p-3042 <-> kp23` (import of p3)
  * `v3.p-3043 <-> kp24` (result p4)

Vat-2 then gets a `dispatch.deliver(target=o+3001, msg={method: "foo", args:
"..", slots=[o-3031, o-3032, o+3001, p-3041, p-3042], result=p-3043})`.

### TODO: more examples

* `syscall.resolve(to=Forward(p))`
* `syscall.resolve(to=Data())`, showing how queued messages are then rejected
* `syscall.resolve(to=Rejection())`, ditto

```
p1 = make_promise();
x!foo(p1);
function foo(arg) {
  return p1;
}
```

`foo()` is invoked through an inbound `dispatch.deliver(.., result=p-4)`, and
when it returns a previously-exported promise (aka `p+1`), the support layer
should do `syscall.resolve(p-4, p+1)`.

These situations are legal/sensible and should be documented (and tested!),
but it may require some creativity to come up with Vat Code that could
produce them:

* receiving `result=` of a promise you previously exported
* calling `syscall.send()` with a `result=` of a promise you previously exported
* calling `syscall.send()` with a `result=` of a promise you previously
  received as the result of a `dispatch.deliver()`



## Comms Protocol

Normal vats only ever talk to the kernel. The only way to get messages to an
entirely different SwingSet machine is to go through the Comms Vat, which
gets special access to VatTP and can exchange data with other machines.

The kernel routes messages between multiple vats. The Comms Vat routes
messages between the local kernel and (potentially) multiple external
machines. In this way, the Comms Vat is like the kernel: it must maintain
Object and Promise tables, and a C-List for each remote machine. It does not
need to manage a run-queue (`dispatch()` causes an immediate external
message), nor does it have a kernel-facing C-List (its Object/Promise tables
are indexed by the same `ObjectID`/`PromiseID` Vat types that appear in the
`syscall/dispatch` API. But it does have some routing tables to figure out
where each message needs to go.

The one wrinkle is that Vat-Vat connections are symmetric, which impacts the
way these types are represented. The Vat-Kernel interface is conveniently
asymmetric, so we can declare that positive index values are allocated by the
Vat, while negative values are allocated by the kernel, and it doesn't matter
which direction the messages are going. The naming scheme is "vat-centric".

When the messages travel from one Vat to the other, must instead speak in
terms of the sender and the receiver of any particular message. We declare
that messages arriving at a Vat will use positive index values for objects
that are allocated by the receiver, and negative for the ones allocated by
the sender. Both Vats use this same "receiver-centric" convention for the
externally-facing side of their per-machine C-Lists. As a result, the IDs
inside inbound messages can be looked up in the C-List directly, but when
sending outbound messages, all the IDs must have their signs flipped.

The message names are also different. In the local-machine Vat-Kernel-Vat
flow, the first Vat's outbound message has a different name than the inbound
message (`syscall.send` becomes `dispatch.deliver`, `syscall.resolve` becomes
`dispatch.notify`). In the remote-machine CommsVat-CommsVat flow, there is no
kernel in the middle, so whatever the first Comms Vat sends is exactly what
the second Comms Vat receives. In keeping with the receiver-centric
convention, We use `deliver` for message delivery, and `notify` for promise
resolution.

We also presume `subscribe` happens without the receiving vat requesting it.
The latencies between separate SwingSet machines are high enough that the
tradeoff between more messages vs more roundtrips seems clearly in favor of
more messages.

### Comms Tables

Each comms vat maintains connections to many remote machines, just as each
kernel supports many separate Vats. So comms vats maintain mapping tables
that look very similar to the ones in the kernel. There are two bidirectional
tables for each remote machine (one for objects, the other for promises),
just like the kernel-side C-Lists. There are also routing tables to track
where messages must be sent, similar to the kernel's object and promise
tables.

```
  | remote1 |    | remote2 |    | remote3 |
  |   ^     |    |    ^    |    |   ^     |
  |   |     |    |    |    |    |   |     |
  +---|-----+----+----|----+----+---|-----+-------+
  |   v     |    |    v    |    |   v     |       |
  | remote1 |    | remote2 |    | remote3 |       |
  | tables  |    | tables  |    | tables  |       |
  |                                               |
  |                                               |
  |                 object-table                  |
  |                 promise-table          ^      |
  | Comms Vat                          |   |      |
  +---------------------------------+-syscall--+--+
+-----------------------------------+-dispatch-+------+
|  kernel                              |   |          |
|                                      v              |
```

The data structures are:

```
struct RemoteID(u32);

struct VatPromiseID(i32);
struct VatObjectID(i32);
struct RemotePromiseID(i32);
struct RemoteObjectID(i32);

struct RemoteCList {
    objects: HashMap<VatObjectID, RemoteObjectID>,
    next_object_id: u32,
    promises: HashMap<VatPromiseID, RemotePromiseID>,
    next_promise_id: u32,
}

# the Comms Vat has exactly one CommsTables instance
struct CommsTables {
    remotes: HashMap<RemoteID, RemoteCList>,
    next_object_id: u32,
    object_routes: HashMap<VatObjectID, RemoteID>,
    next_promise_id: u32,
    promise_routes: HashMap<VatPromiseID, RemoteID>,
}
 
```

The two routing tables (`object_routes` and `promise_routes`) are used to
handle message sends that originate on a local vat and are destined for some
remote vat. The keys of `object_routes` are positive integers (object IDs
allocated by the comms vat and exported into the kernel for use by other
local vats). The keys of `promise_routes` may be positive or negative, but
identify promises for which, from the point of view of the local kernel, the
comms vat holds resolution authority. Other vats on remote machines hold the
real resolution authority, but the local kernel will only learn about
resolution from the local comms vat.

When the comms vat receives a `dispatch.deliver()` for some target, it is
looked up in the routing tables. If it is not found there, the message must
be meant for a local object (used to manage the comms vat itself, and the
connections it makes to other machines).

Once the remote machine ID is known, the rest of the message slots (target,
argument slots, and optional result) are mapped through a C-List that is
specific to that machine. The mapping rules are similar to the ones used by
the kernel as it does a `dispatch.deliver()`, but are adjusted to accomodate
three-party handoff (which is disabled until we finish designing it) and the
lack of a single central kernel:

* The target (object or promise) must already exist in the table.
* When an argument object ID is not already present in the table, we allocate
  a new entry if the ID is negative (imported from the kernel), and we throw
  a `ThreePartyHandoff` error if it is positive.
* The `result=` promise, if already in the routing table, must have a Decider
  that matches the destination machine, else we throw `ThreePartyHandoff`.
  New kernel-allocated promises are added to the routing table and the
  Decider set to the destination machine.


### Comms Example

```
+- Left Vat -+   +- Left  --+      +- Right --+    +-Right Vat+
|            |   |  Comms   |      |  Comms   |    |          |
|p1=bob!foo()|   |          |      |          |    |          |
|            |   |  comms ----------> comms   |    |          |
|            |   |  code    |      |  code    |    | bob.foo()|
|            |   |          |      |          |    |          |
| ---------- |   | -------- |      | -------- |    | -------- |
|            |   |          |      |          |    |          |
|  send()    |   | deliver  |      |  send()  |    | deliver  |
|    |       |   |   ^      |      |   |      |    |   ^      |
|    |       |   |   |      |      |   |      |    |   |      |
+----|-------+   +---|------+      +---|------+    +---|------+
+----|-------+---+---|------+-+  +-+---|------+----+---|------+-+
|    v       |   |   |      | |  | |   v      |    |   |      | |
|  clists    |   |  clists  | |  | |  clists  |    |  clists  | |
|    |       |   |   ^      | |  | |   |      |    |   |      | |
|    |               |        |  |     |               |        |
|    |               |        |  |     |               |        |
|    \-> run-queue --/        |  |     \-> run-queue --/        |
|                             |  |                              |
|                             |  |                              |
+--------- Left Kernel -------+  +----- Right Kernel -----------+
```

Initial conditions:

* Left Kernel Object Table:
  * `ko1` (bob): owner= left-comms
* Kernel Promise Table: empty
* Kernel run-queue: empty
* left-vat (id=1) kernel C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
* left-comms (id=2) kernel C-List:
  * `v2.o+2001 <-> ko1` (export of bob proxy)
* left-comms object routing table:
  * `o+2001 -> right`
* left-comms cross-machine C-Lists
  * `right:`
    * `o+2001 <-> right:ro-3001`
* right-comms cross-machine C-Lists
  * `left:`
    * `left:ro+3001 <-> o-4001`
* right-comms (id=3) kernel C-List
  * `v3.o-4001 <-> ko2` (import of real bob)
* right-vat (id=4) kernel C-List
  * `v4.o+5001 <-> ko2` (export of real bob)

left-vat does `p1 = bob ! foo()`. Left kernel accepts `syscall.send()` and
the run-queue gets `Send(target=ko1, msg={name: foo, result=kp24})`, which
eventually comes to the front and is delivered to left-comms. The left-kernel
tables just before `dispatch.deliver()` is called will look like:

* Left Kernel Object Table:
  * `ko1` (bob): owner= left-comms
* Kernel Promise Table:
  * `kp24: state: Unresolved(decider: v2, subscribers: [v1])`
* left-vat (id=1) kernel C-List:
  * `v1.o-1001 <-> ko1` (import of bob)
  * `v1.p+104 <-> kp24` (export of result promise)
* left-comms (id=2) kernel C-List:
  * `v2.o+2001 <-> ko1` (export of bob)
  * `v2.p-2015 <-> kp24` (import of result)

left-comms gets `deliver(target=o+2001)` and looks up the target in the
routing table to see that the destination machine is `right`. It maps
`o+2001` through the `right` c-list table to get `ro-3001`, which it uses in
the wire message. It sees the result promise (`p-2015`) has no mapping in the
routing table, so it adds it (with `Decider: right`), then sees that `p-2015`
is not in the c-list, and adds it too, allocating a new ID (`rp+3202`).
Left-comms uses these identifiers to generate the cross-machine message,
expressed in receiver-centric terms (so the signs are flipped):

* left-comms object routing table:
  * `o+2001 -> right`
* left-comms promise routing table:
  * `p-2015 -> right`
* left-comms cross-machine C-Lists
  * `right:`
    * `o+2001 <-> right:ro-3001`
    * `p-2015 <-> right:rp+3202`
* Left Outbox (target=`right`)
  * `deliver(target=ro+3001, msg={name: foo, result=rp-3202})`

An external delivery process copies the cross-machine message from the left
Outbox into the right machine, causing a pending delivery that gets the
message into the right-comms vat, along with the name of the machine that
sent it (`left`). Right-comms looks up the target (`ro+3001`) in the `left`
c-list to find `o-4001`. It sees that the result promise `rp-3202` is not
present in the c-list, so it allocates a new local ID (`p+4002`) and adds it
to the c-list. It does *not* add `p+4002` to the routing table, because the
kernel will hold the resolution authority for this result.

* right-comms cross-machine C-Lists
  * `left:`
    * `left:ro+3001 <-> o-4001`
    * `left:rp-3202 <-> p+4002`
* right-comms object routing table: empty
* right-comms promise routing table: empty

Finally it submits
the transformed message to the right kernel: `syscall.send(target=o-4001,
msg={name: foo, result=p+4002})`.

The right kernel maps the arguments of the `Send` through the right-comms
kernel C-List. The target maps to `ko2`, and the result causes a new Promise
to be allocated (`kp6001`), with a Decider of None. The pending delivery is
pushed onto the back of the run-queue:

* right-comms (id=3) kernel C-List
  * `v3.o-4001 <-> ko2` (import of real bob)
  * `v3.p+4002 <-> kp6001` (result promise)
* run-queue:
  * `Send(target=ko2, msg={name: foo, result=kp6001})`

The delivery is dispatched to right-vat, which causes a new C-List entry to
be added for the result promise (`v4.p-5002`), and invokes
`dispatch.deliver(target=o+5001, msg={name: foo, result=p-5002})`:

* right-vat (id=4) kernel C-List
  * `v4.o+5001 <-> ko2` (export of real bob)
  * `v4.p-5002 <-> kp6001` (import of result promise)

#### response

Now suppose right-vat resolves the result promise to a new local object
(`v4.o+5003`). We trace the `syscall.resolve` back to the left-vat:

* right-vat: `syscall.resolve(subject=p-5002, Fulfill(o+5003))`
* right kernel right-vat C-List: `v4.o+5003 <-> ko3`
* right run-queue `Notify(target=kp6001, Fulfill(ko3))`
* notification gets to front, right kernel promise table updated
  * `kp6001: state = FulfillToTarget(ko3)`
  * subscribers each get a `dispatch.notify`
* right-comms: `dispatch.notify(target=p+4002, Fulfill(o-4003))`
* right-comms promise routing table lookup (`p+4002`) says destination machine is `left`
* right-comms allocates `ro+3002` for the object `o-4003`
* outbox message is `notify(target=rp+3202, Fulfill(ro-3002))`
* left-comms gets message from `right`, maps target to `p-2015`
* left-comms maps resolution through right-machine c-list, allocates `o+2002`
* left-comms submits `syscall.resolve(target=p-2015, Fulfill(o+2002))`
* left kernel maps through left-comms c-list, allocates `ko15` for `v2.o+2002`
* left run-queue `Notify(target=kp24, Fulfill(ko15))`
* subscribers each get `dispatch.notify`
* `v1.o-1002` allocated for `ko15` in left-vat c-list
* left-vat gets `dispatch.notify(target=p+104, Fulfill(o-1002))`


## comms notes

The message target has three cases:

* imported object (owner is some remote machine)
* imported promise (owner+decider are some remote machine)
* "send result"? (promise, owner is us, but decider is remote machine)

The owner (for objects) or decider (for promises) tells us the target machine
ID, which we must know before we can serialize anything else.

If the argument is an object, there are three cases:

* A exported object (owner is us)
* B imported object (owner is target machine)
* C handoff object (owner is neither us nor target)

If the argument is a promise, there are 3 cases:

* A exported promise: kernel is decider
* B imported promise: target machine is decider
* C handoff promise: some other machine is decider

We do not yet attempt to implement three-party handoff, so both handoff cases
currently cause an error. We discover this by comparing the owner/decider of
comms-vat-owned object/promises (i.e. the ID is a positive integer) against
the destination machine. If they differ, the send is abandoned (TODO: how
should we signal this error?).

Then we check to see if the ObjectID/PromiseID is in the table for the target
machine, and allocate a new connection-local RemoteID if necessary. This
should only wind up allocating if the ID was negative (kernel-owned).

The optional `result` field, if present, must be a promise. The comms vat is
given resolution authority as it arrives. If the promise is already in
`CommsPromiseTable`, the Decider must be equal to the destination machine,
else the send is abandoned. If it is not already in the table, it is added,
and the Decider set equal to the destination machine.

The result promise is then mapped through the per-machine table as with
argument promises, and allocated in the same way.

### Three-Party Handoff

We're deferring three-party handoff for now, because our main use case
doesn't strictly need it. Any time an object or promise is received from one
machine and then sent to another, the message is abandoned and an error is
reported (TODO: how?).


In the future, the simplest way to enable handoffs will be to inject
forwarding objects. Messages and resolutions will take the long path,
traversing through intermediate machines until they reach their destination.

But the long-term goal is to use a better protocol and shorten the path over
which messages must be delivered.


## open questions

* Dean suggested the distinct `Resolver` type in the syscall API, to avoid
  type confusion bugs (passing a Promise when you really meant to refer to
  your resolution authority). But I'm finding that makes the spec harder to
  explain. I'm inclined to stick to `Object` and `Promise`, and just note in
  the API signatures that three `Promise`-accepting slots are special:
  passing a Promise into `send()`'s `Message.result` gives away your
  resolution authority, getting one in `dispatch()`'s `Message.result` grants
  you resolution authority, and putting one in `notify()`'s subject exercises
  (and consumes) that authority.
* We must deliver pipelined messages to the comms vat (instead of queueing
  them in the kernel) to enable useful pipelining. This design delivers
  pipelined messages to *all* vats, even though the comms vat is the only one
  where it's useful. We could have a per-Vat flag to enable/disable
  kernel-side queueing (but the kernel is a lot simpler without that
  queuing). If we stick with deliver-to-everyone, then I'm inclined to have
  Vats queue those messages in their original (marshalled) form until we know
  whether we're consuming them or forwarding them elsewhere, but Dean
  recommended unmarshalling them immediately (to avoid confusion over tables
  they might reference which could change between now and delivery), then
  remarshalling them later.. it depends on what vat-side tables are involved
  and how they might change.
* The message flow would be simpler if these queued messages could be dumped
  back into the kernel after a promise is resolved, and let the kernel deal
  with it. `syscall.resolve(subject, resolution, queued_messages)`. I'd like
  to have `CannotSendToData` errors generated in just one place, for example.
  It'd be even simpler if we could use this for resolutions that point at the
  same Vat doing the resolution (instead of processing those messages
  immediately), but that probably has ordering consequences.
* Dean pointed out an important performance improvement, Promises which are
  resolved/rejected to data (or forwarded?) should be removed from the
  resolving vat's c-list right away. We'd need an extra message in the future
  if that vat ever sends that promise again, but apparenly the vast majority
  of the time it never will, so pruning the c-list immediately is a big win.
  This might interfere with having the kernel handle dumped queued messages.
  Why do this for data+forward but not for fulfill?
* Forwarded promises must not create cycles. Vats should not be able to trick
  other Vats into creating a cycle and thus get terminated. Cycles are
  cheaper to detect if we can remove forwarded promises from the table right
  away. Keeping forwarded promises around makes it easier to use the kernel
  to handle the dumped queued messages from the old promise.
* What do we need from the relative ordering of a `dispatch.notify()` and the
  queued messages now headed to that resolution? The current design has the
  notify first, then the messages, is that ok?


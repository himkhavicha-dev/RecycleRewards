;; RecycleToken.clar
;; SIP-010 Compliant Fungible Token for RecycleRewards
;; Manages RT (RecycleToken) with controlled minting, pausing, burning, transfers with hooks, metadata, and admin controls.

;; Traits
(define-trait admin-trait
  (
    (add-minter (principal) (response bool uint))
    (remove-minter (principal) (response bool uint))
    (pause-contract () (response bool uint))
    (unpause-contract () (response bool uint))
    (set-admin (principal) (response bool uint))
  )
)

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-PAUSED u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-RECIPIENT u103)
(define-constant ERR-INVALID-MINTER u104)
(define-constant ERR-ALREADY-REGISTERED u105)
(define-constant ERR-METADATA-TOO-LONG u106)
(define-constant ERR-INSUFFICIENT-BALANCE u107)
(define-constant ERR-INVALID-SENDER u108)
(define-constant ERR-TRANSFER-FAILED u109)
(define-constant ERR-BURN-FAILED u110)
(define-constant ERR-NO-BALANCE u111)
(define-constant ERR-INVALID-METADATA u112)
(define-constant MAX-METADATA-LEN u500)
(define-constant TOKEN-NAME "RecycleToken")
(define-constant TOKEN-SYMBOL "RT")
(define-constant TOKEN-DECIMALS u6) ;; 6 decimals for micro-units

;; Data Variables
(define-data-var contract-admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)

;; Data Maps
(define-map balances principal uint)
(define-map minters principal bool)
(define-map mint-records uint
  {
    amount: uint,
    recipient: principal,
    metadata: (string-utf8 500),
    timestamp: uint,
    minter: principal
  }
)
(define-map allowances { owner: principal, spender: principal } uint)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get contract-admin))
)

(define-private (is-minter (caller principal))
  (default-to false (map-get? minters caller))
)

(define-private (add-balance (account principal) (amount uint))
  (let ((current (default-to u0 (map-get? balances account))))
    (map-set balances account (+ current amount))
    (ok true)
  )
)

(define-private (subtract-balance (account principal) (amount uint))
  (let ((current (default-to u0 (map-get? balances account))))
    (if (>= current amount)
      (begin
        (map-set balances account (- current amount))
        (ok true)
      )
      (err ERR-INSUFFICIENT-BALANCE)
    )
  )
)

;; Public Functions - SIP-010
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender sender) (err ERR-INVALID-SENDER))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-RECIPIENT)) ;; Blackhole prevention
    (try! (subtract-balance sender amount))
    (try! (add-balance recipient amount))
    (ok true)
  )
)

(define-public (get-name)
  (ok TOKEN-NAME)
)

(define-public (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-public (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-public (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

(define-public (get-total-supply)
  (ok (var-get total-supply))
)

(define-public (get-token-uri)
  (ok (some "https://recyclerewards.com/token-metadata.json"))
)

;; Additional Public Functions
(define-public (mint (amount uint) (recipient principal) (metadata (string-utf8 500)))
  (let ((mint-id (+ (var-get total-supply) u1))) ;; Simple increment for ID
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-minter tx-sender) (err ERR-INVALID-MINTER))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-INVALID-RECIPIENT))
    (asserts! (<= (len metadata) MAX-METADATA-LEN) (err ERR-METADATA-TOO-LONG))
    (try! (add-balance recipient amount))
    (var-set total-supply (+ (var-get total-supply) amount))
    (map-set mint-records mint-id
      {
        amount: amount,
        recipient: recipient,
        metadata: metadata,
        timestamp: block-height,
        minter: tx-sender
      }
    )
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (try! (subtract-balance tx-sender amount))
    (var-set total-supply (- (var-get total-supply) amount))
    (ok true)
  )
)

(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (not (is-minter minter)) (err ERR-ALREADY-REGISTERED))
    (map-set minters minter true)
    (ok true)
  )
)

(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (map-set minters minter false)
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set paused false)
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set contract-admin new-admin)
    (ok true)
  )
)

;; Read-only Functions
(define-read-only (is-paused)
  (var-get paused)
)

(define-read-only (get-mint-record (id uint))
  (map-get? mint-records id)
)

(define-read-only (get-admin)
  (var-get contract-admin)
)

(define-public (set-allowance (spender principal) (amount uint))
  (begin
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (ok true)
  )
)

(define-public (transfer-from (amount uint) (owner principal) (recipient principal))
  (let ((allowance (default-to u0 (map-get? allowances { owner: owner, spender: tx-sender }))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (>= allowance amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (subtract-balance owner amount))
    (try! (add-balance recipient amount))
    (map-set allowances { owner: owner, spender: tx-sender } (- allowance amount))
    (ok true)
  )
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (default-to u0 (map-get? allowances { owner: owner, spender: spender }))
)

;; Initialization
(map-set minters tx-sender true) ;; Deployer is initial minter
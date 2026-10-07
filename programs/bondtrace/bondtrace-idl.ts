/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bondtrace.json`.
 */
export type Bondtrace = {
  "address": "B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8",
  "metadata": {
    "name": "bondtrace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Permissioned corporate-action prototype for tokenized bonds"
  },
  "instructions": [
    {
      "name": "beginRedemption",
      "discriminator": [
        216,
        201,
        198,
        249,
        152,
        16,
        103,
        62
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "captureCoupon",
      "discriminator": [
        95,
        102,
        0,
        162,
        50,
        70,
        175,
        103
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "coupon",
          "writable": true
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "castVote",
      "discriminator": [
        20,
        212,
        15,
        189,
        69,
        180,
        69,
        151
      ],
      "accounts": [
        {
          "name": "voter",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          },
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "proposal.proposalId",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "ballot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  108,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "support",
          "type": "bool"
        }
      ]
    },
    {
      "name": "claimCoupon",
      "discriminator": [
        210,
        153,
        241,
        46,
        195,
        18,
        161,
        99
      ],
      "accounts": [
        {
          "name": "holder",
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          },
          "relations": [
            "coupon"
          ]
        },
        {
          "name": "coupon",
          "writable": true
        },
        {
          "name": "settlementMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          },
          "relations": [
            "bond"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createProposal",
      "discriminator": [
        132,
        116,
        68,
        174,
        216,
        160,
        198,
        22
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "arg",
                "path": "proposalId"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "proposalId",
          "type": "u64"
        },
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "closesAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "fundVault",
      "discriminator": [
        26,
        33,
        207,
        242,
        119,
        108,
        134,
        73
      ],
      "accounts": [
        {
          "name": "funder",
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          },
          "relations": [
            "bond"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeIssue",
      "discriminator": [
        253,
        187,
        127,
        191,
        30,
        80,
        66,
        168
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "issuer"
              },
              {
                "kind": "arg",
                "path": "seriesId"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          }
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "seriesId",
          "type": "u64"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "faceValue",
          "type": "u64"
        },
        {
          "name": "maturityTs",
          "type": "i64"
        },
        {
          "name": "coupons",
          "type": {
            "vec": {
              "defined": {
                "name": "couponTerms"
              }
            }
          }
        }
      ]
    },
    {
      "name": "issueUnits",
      "discriminator": [
        39,
        120,
        190,
        191,
        225,
        131,
        155,
        248
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "writable": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "holderBonds",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemPrincipal",
      "discriminator": [
        146,
        17,
        79,
        16,
        88,
        228,
        232,
        111
      ],
      "accounts": [
        {
          "name": "holder",
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "writable": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "holderBonds",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "bondMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          },
          "relations": [
            "bond"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "registerHolder",
      "discriminator": [
        113,
        111,
        117,
        246,
        175,
        59,
        98,
        161
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "wallet"
        },
        {
          "name": "holderBonds",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "bondMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sealIssue",
      "discriminator": [
        204,
        110,
        75,
        92,
        184,
        83,
        100,
        132
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          },
          "relations": [
            "bond"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "transferUnits",
      "discriminator": [
        65,
        73,
        198,
        106,
        237,
        36,
        61,
        137
      ],
      "accounts": [
        {
          "name": "holder",
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bond"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bond"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "ballot",
      "discriminator": [
        3,
        232,
        121,
        204,
        232,
        137,
        138,
        164
      ]
    },
    {
      "name": "bond",
      "discriminator": [
        224,
        128,
        48,
        251,
        182,
        246,
        111,
        196
      ]
    },
    {
      "name": "coupon",
      "discriminator": [
        24,
        230,
        224,
        210,
        200,
        206,
        79,
        57
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    }
  ],
  "events": [
    {
      "name": "actionReceipt",
      "discriminator": [
        201,
        229,
        26,
        9,
        254,
        114,
        4,
        38
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedIssuer",
      "msg": "Only the configured issuer may perform this operation"
    },
    {
      "code": 6001,
      "name": "invalidPhase",
      "msg": "This operation is unavailable in the issue's current phase"
    },
    {
      "code": 6002,
      "name": "invalidTerms",
      "msg": "Terms, dates, name or amount are invalid"
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Checked integer arithmetic overflow"
    },
    {
      "code": 6004,
      "name": "registryFull",
      "msg": "The registry supports at most sixteen pre-registered holders"
    },
    {
      "code": 6005,
      "name": "alreadyRegistered",
      "msg": "Wallet is already registered"
    },
    {
      "code": 6006,
      "name": "unregisteredHolder",
      "msg": "Wallet is not in this issue's sealed holder registry"
    },
    {
      "code": 6007,
      "name": "invalidHolderAccount",
      "msg": "Expected the canonical holder token account for this bond mint"
    },
    {
      "code": 6008,
      "name": "unsafeTokenAuthority",
      "msg": "Token accounts cannot have delegates or custom close authorities"
    },
    {
      "code": 6009,
      "name": "tooEarly",
      "msg": "The requested action is not due yet"
    },
    {
      "code": 6010,
      "name": "recordDateLocked",
      "msg": "Capture the due coupon record before transferring bonds"
    },
    {
      "code": 6011,
      "name": "matured",
      "msg": "Transfers and new proposals stop at maturity"
    },
    {
      "code": 6012,
      "name": "pendingCoupon",
      "msg": "Capture all coupon records before beginning principal redemption"
    },
    {
      "code": 6013,
      "name": "invalidCouponIndex",
      "msg": "Coupon records must be captured exactly once in schedule order"
    },
    {
      "code": 6014,
      "name": "supplyMismatch",
      "msg": "Supply or holder balances do not match the sealed issue"
    },
    {
      "code": 6015,
      "name": "incompleteSnapshot",
      "msg": "Pass every registered holder account in exact registry order"
    },
    {
      "code": 6016,
      "name": "insufficientReserve",
      "msg": "The vault must cover all principal and coupon liabilities"
    },
    {
      "code": 6017,
      "name": "alreadyClaimed",
      "msg": "This wallet already received this payment"
    },
    {
      "code": 6018,
      "name": "noEntitlement",
      "msg": "The immutable snapshot grants this wallet no entitlement"
    },
    {
      "code": 6019,
      "name": "sameAccount",
      "msg": "Source and destination must be different accounts"
    },
    {
      "code": 6020,
      "name": "votingClosed",
      "msg": "The ballot window has closed"
    },
    {
      "code": 6021,
      "name": "alreadyVoted",
      "msg": "This wallet already cast a ballot on this proposal"
    },
    {
      "code": 6022,
      "name": "recordDatePassed",
      "msg": "Draft changes must finish before the first coupon record date"
    }
  ],
  "types": [
    {
      "name": "actionReceipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "docs": [
              "0=issued, 1=transferred, 2=coupon captured, 3=coupon paid,",
              "4=redemption opened, 5=principal paid, 6=proposal opened, 7=vote."
            ],
            "type": "u8"
          },
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "actionId",
            "type": "u64"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ballot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "weight",
            "type": "u64"
          },
          {
            "name": "support",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bond",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "bondMint",
            "type": "pubkey"
          },
          {
            "name": "settlementMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "seriesId",
            "type": "u64"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "faceValue",
            "docs": [
              "Settlement-token base units per whole bond, never floating point."
            ],
            "type": "u64"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          },
          {
            "name": "totalIssued",
            "type": "u64"
          },
          {
            "name": "totalRedeemed",
            "type": "u64"
          },
          {
            "name": "state",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "nextCouponIndex",
            "type": "u8"
          },
          {
            "name": "principalClaimedMask",
            "type": "u16"
          },
          {
            "name": "holderWallets",
            "docs": [
              "Immutable after sealing; every snapshot uses precisely this order."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "couponTerms",
            "type": {
              "vec": {
                "defined": {
                  "name": "couponTerms"
                }
              }
            }
          },
          {
            "name": "redemptionUnits",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "coupon",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "paymentTs",
            "type": "i64"
          },
          {
            "name": "unitAmount",
            "type": "u64"
          },
          {
            "name": "capturedAt",
            "type": "i64"
          },
          {
            "name": "totalUnits",
            "type": "u64"
          },
          {
            "name": "claimedMask",
            "type": "u16"
          },
          {
            "name": "paidTotal",
            "type": "u64"
          },
          {
            "name": "units",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "couponTerms",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "paymentTs",
            "type": "i64"
          },
          {
            "name": "unitAmount",
            "docs": [
              "Settlement-token base units payable for one whole bond."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "proposalId",
            "type": "u64"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "totalUnits",
            "type": "u64"
          },
          {
            "name": "yesUnits",
            "type": "u64"
          },
          {
            "name": "noUnits",
            "type": "u64"
          },
          {
            "name": "ballotMask",
            "type": "u16"
          },
          {
            "name": "units",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};

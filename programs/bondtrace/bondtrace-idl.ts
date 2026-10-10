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
      "name": "appendScheduleV2",
      "discriminator": [
        181,
        244,
        224,
        180,
        82,
        231,
        116,
        164
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          }
        },
        {
          "name": "schedulePage",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
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
          "name": "pageIndex",
          "type": "u32"
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
      "name": "beginCouponV2",
      "discriminator": [
        117,
        58,
        196,
        31,
        5,
        229,
        238,
        191
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "schedulePage"
          ]
        },
        {
          "name": "action",
          "writable": true
        },
        {
          "name": "schedulePage"
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
          "type": "u32"
        }
      ]
    },
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
          "name": "executor",
          "docs": [
            "Permissionless caller; opening fixes rights but cannot change recipients.",
            "Kept first in the account list for legacy transaction wire compatibility."
          ],
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
          "relations": [
            "bond"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "beginRedemptionV2",
      "discriminator": [
        197,
        61,
        95,
        158,
        199,
        75,
        47,
        14
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          }
        },
        {
          "name": "action",
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
      "args": []
    },
    {
      "name": "captureActionPageV2",
      "discriminator": [
        95,
        76,
        72,
        146,
        111,
        196,
        81,
        211
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "registryPage"
          ]
        },
        {
          "name": "action",
          "writable": true
        },
        {
          "name": "registryPage",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
              }
            ]
          }
        },
        {
          "name": "snapshotPage",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  110,
                  97,
                  112,
                  115,
                  104,
                  111,
                  116,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "action"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
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
          "name": "pageIndex",
          "type": "u32"
        }
      ]
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
      "name": "castVoteV2",
      "discriminator": [
        232,
        233,
        147,
        178,
        8,
        96,
        39,
        123
      ],
      "accounts": [
        {
          "name": "voter",
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "holderRecord"
          ]
        },
        {
          "name": "action",
          "writable": true,
          "relations": [
            "snapshotPage"
          ]
        },
        {
          "name": "holderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "snapshotPage",
          "writable": true
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
                  116,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "action"
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
      "name": "claimCouponV2",
      "discriminator": [
        109,
        38,
        152,
        203,
        65,
        97,
        27,
        224
      ],
      "accounts": [
        {
          "name": "executor",
          "signer": true
        },
        {
          "name": "beneficiary"
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "holderRecord"
          ]
        },
        {
          "name": "action",
          "writable": true,
          "relations": [
            "snapshotPage"
          ]
        },
        {
          "name": "holderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "beneficiary"
              }
            ]
          }
        },
        {
          "name": "snapshotPage",
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
                  116,
                  95,
                  118,
                  50
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
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "beneficiary"
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
                "path": "settlementMint"
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
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
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
      "name": "createProposalV2",
      "discriminator": [
        4,
        223,
        226,
        68,
        187,
        224,
        151,
        218
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          }
        },
        {
          "name": "action",
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
          "name": "proposalId",
          "type": "u32"
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
      "name": "createRegistryPageV2",
      "discriminator": [
        100,
        130,
        135,
        149,
        49,
        40,
        25,
        130
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          }
        },
        {
          "name": "registryPage",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
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
          "name": "pageIndex",
          "type": "u32"
        }
      ]
    },
    {
      "name": "finalizeActionV2",
      "discriminator": [
        18,
        184,
        120,
        86,
        125,
        33,
        82,
        84
      ],
      "accounts": [
        {
          "name": "executor",
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "nextSchedulePage"
          ]
        },
        {
          "name": "action",
          "writable": true
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "nextSchedulePage",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "bond.finalizeSchedulePageAction.kind",
                "account": "bondV2"
              }
            ]
          }
        }
      ],
      "args": []
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
      "name": "fundVaultV2",
      "discriminator": [
        9,
        127,
        56,
        113,
        141,
        70,
        101,
        23
      ],
      "accounts": [
        {
          "name": "funder",
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
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
                  116,
                  95,
                  118,
                  50
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
      "name": "initializeIssueV2",
      "discriminator": [
        83,
        44,
        16,
        227,
        184,
        146,
        123,
        251
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
                  100,
                  95,
                  118,
                  50
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
                  116,
                  95,
                  118,
                  50
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
                  116,
                  95,
                  118,
                  50
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
          "name": "couponCount",
          "type": "u32"
        },
        {
          "name": "rateBps",
          "type": "u16"
        },
        {
          "name": "frequency",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeRateIssue",
      "discriminator": [
        183,
        250,
        76,
        96,
        58,
        165,
        92,
        167
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
          "name": "financialTerms",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  110,
                  97,
                  110,
                  99,
                  105,
                  97,
                  108,
                  95,
                  116,
                  101,
                  114,
                  109,
                  115
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
        },
        {
          "name": "rateBps",
          "type": "u16"
        },
        {
          "name": "frequency",
          "type": "u8"
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
      "name": "issueUnitsV2",
      "discriminator": [
        112,
        173,
        47,
        5,
        73,
        63,
        194,
        137
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "holderRecord"
          ]
        },
        {
          "name": "holderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "holderRecord.wallet",
                "account": "holderV2"
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
                "path": "holderRecord.wallet",
                "account": "holderV2"
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
      "name": "redeemPrincipalV2",
      "discriminator": [
        21,
        136,
        87,
        233,
        26,
        175,
        182,
        36
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "holderRecord"
          ]
        },
        {
          "name": "action",
          "writable": true,
          "relations": [
            "snapshotPage"
          ]
        },
        {
          "name": "holderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "holder"
              }
            ]
          }
        },
        {
          "name": "snapshotPage",
          "writable": true
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
                  116,
                  95,
                  118,
                  50
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
                "path": "settlementMint"
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
      "name": "registerHolderV2",
      "discriminator": [
        136,
        60,
        127,
        158,
        185,
        97,
        173,
        225
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "registryPage"
          ]
        },
        {
          "name": "registryPage",
          "writable": true
        },
        {
          "name": "holderRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "wallet"
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u32"
        }
      ]
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
      "name": "sealIssueV2",
      "discriminator": [
        114,
        143,
        195,
        133,
        148,
        190,
        62,
        213
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
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
                  116,
                  95,
                  118,
                  50
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
      "name": "settleCoupon",
      "docs": [
        "Anyone may deliver an already-fixed coupon to its beneficiary. The",
        "beneficiary never delegates custody and the same mask protects both paths."
      ],
      "discriminator": [
        210,
        249,
        224,
        28,
        55,
        142,
        211,
        251
      ],
      "accounts": [
        {
          "name": "executor",
          "docs": [
            "Pays transaction fees; cannot choose the entitlement or redirect it."
          ],
          "signer": true
        },
        {
          "name": "holder"
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
                "path": "settlementMint"
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
      "name": "settleCouponV2",
      "discriminator": [
        24,
        132,
        105,
        105,
        131,
        28,
        164,
        37
      ],
      "accounts": [
        {
          "name": "executor",
          "signer": true
        },
        {
          "name": "beneficiary"
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "action",
            "holderRecord"
          ]
        },
        {
          "name": "action",
          "writable": true,
          "relations": [
            "snapshotPage"
          ]
        },
        {
          "name": "holderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "beneficiary"
              }
            ]
          }
        },
        {
          "name": "snapshotPage",
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
                  116,
                  95,
                  118,
                  50
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
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "beneficiary"
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
                "path": "settlementMint"
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
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
    },
    {
      "name": "transferUnitsV2",
      "discriminator": [
        170,
        179,
        3,
        85,
        119,
        156,
        215,
        244
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
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond.issuer",
                "account": "bondV2"
              },
              {
                "kind": "account",
                "path": "bond.seriesId",
                "account": "bondV2"
              }
            ]
          },
          "relations": [
            "sourceHolder",
            "destinationHolder"
          ]
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "sourceHolder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "holder"
              }
            ]
          }
        },
        {
          "name": "destinationHolder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "destinationHolder.wallet",
                "account": "holderV2"
              }
            ]
          }
        },
        {
          "name": "source",
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
          "name": "destination",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "destinationHolder.wallet",
                "account": "holderV2"
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
      "name": "actionV2",
      "discriminator": [
        4,
        54,
        13,
        121,
        181,
        187,
        15,
        229
      ]
    },
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
      "name": "ballotV2",
      "discriminator": [
        170,
        216,
        195,
        250,
        56,
        114,
        163,
        124
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
      "name": "bondV2",
      "discriminator": [
        16,
        18,
        101,
        41,
        213,
        144,
        208,
        17
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
      "name": "financialTerms",
      "discriminator": [
        123,
        13,
        162,
        209,
        216,
        188,
        57,
        195
      ]
    },
    {
      "name": "holderV2",
      "discriminator": [
        199,
        131,
        204,
        226,
        127,
        241,
        7,
        177
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
    },
    {
      "name": "registryPageV2",
      "discriminator": [
        213,
        133,
        102,
        238,
        189,
        81,
        107,
        133
      ]
    },
    {
      "name": "schedulePageV2",
      "discriminator": [
        38,
        252,
        228,
        20,
        145,
        115,
        9,
        81
      ]
    },
    {
      "name": "snapshotPageV2",
      "discriminator": [
        123,
        51,
        59,
        148,
        191,
        54,
        224,
        89
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
    },
    {
      "name": "actionReceiptV2",
      "discriminator": [
        249,
        138,
        69,
        65,
        245,
        108,
        17,
        175
      ]
    },
    {
      "name": "couponSettlementReceipt",
      "discriminator": [
        82,
        162,
        74,
        95,
        144,
        206,
        33,
        101
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
    },
    {
      "code": 6023,
      "name": "invalidPage",
      "msg": "Expected the canonical page and the next sequential page index"
    },
    {
      "code": 6024,
      "name": "snapshotLocked",
      "msg": "A paged snapshot is in progress; transfers and registry changes are locked"
    },
    {
      "code": 6025,
      "name": "scheduleIncomplete",
      "msg": "Append the complete immutable coupon schedule before continuing"
    },
    {
      "code": 6026,
      "name": "snapshotNotFinalized",
      "msg": "Finalize every snapshot page before claiming or voting"
    },
    {
      "code": 6027,
      "name": "invalidActionKind",
      "msg": "The action kind does not support this operation"
    },
    {
      "code": 6028,
      "name": "invalidHolderIndex",
      "msg": "Expected the next append-only registry position"
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
      "name": "actionReceiptV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "executor",
            "type": "pubkey"
          },
          {
            "name": "beneficiary",
            "type": "pubkey"
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
      "name": "actionV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u32"
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
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "holderCount",
            "docs": [
              "Registry prefix frozen when capture starts. Later holders have no rights."
            ],
            "type": "u32"
          },
          {
            "name": "capturedPages",
            "type": "u32"
          },
          {
            "name": "totalUnits",
            "type": "u64"
          },
          {
            "name": "paidTotal",
            "type": "u64"
          },
          {
            "name": "claimedUnits",
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
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "title",
            "type": "string"
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
      "name": "ballotV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
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
      "name": "bondV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
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
            "name": "faceValue",
            "type": "u64"
          },
          {
            "name": "rateBps",
            "type": "u16"
          },
          {
            "name": "frequency",
            "type": "u8"
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
            "name": "revision",
            "docs": [
              "Optimistic read fence for paginated RPC reads. Every program mutation",
              "touching this instrument's economic graph increments it exactly once."
            ],
            "type": "u64"
          },
          {
            "name": "holderCount",
            "type": "u32"
          },
          {
            "name": "couponCount",
            "type": "u32"
          },
          {
            "name": "scheduleAppended",
            "type": "u32"
          },
          {
            "name": "nextCouponIndex",
            "type": "u32"
          },
          {
            "name": "firstRecordTs",
            "type": "i64"
          },
          {
            "name": "nextRecordTs",
            "type": "i64"
          },
          {
            "name": "lastRecordTs",
            "type": "i64"
          },
          {
            "name": "lastPaymentTs",
            "type": "i64"
          },
          {
            "name": "couponUnitTotal",
            "type": "u64"
          },
          {
            "name": "activeKind",
            "docs": [
              "Zero means no capture. One instrument has at most one capture in flight."
            ],
            "type": "u8"
          },
          {
            "name": "activeId",
            "type": "u32"
          },
          {
            "name": "name",
            "type": "string"
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
      "name": "couponSettlementReceipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "coupon",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "executor",
            "type": "pubkey"
          },
          {
            "name": "beneficiary",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
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
      "name": "financialTerms",
      "docs": [
        "Created atomically with a rate-based issue. There is deliberately no update,",
        "close, or attach-to-existing-bond instruction for this immutable account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "nominal",
            "docs": [
              "Settlement-token base units per whole bond."
            ],
            "type": "u64"
          },
          {
            "name": "rateBps",
            "type": "u16"
          },
          {
            "name": "frequency",
            "type": "u8"
          },
          {
            "name": "unitAmount",
            "docs": [
              "Exact settlement-token base units for each regular coupon."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holderV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "index",
            "docs": [
              "Append-only; never reused or changed, even after a zero balance or burn."
            ],
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
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
    },
    {
      "name": "registryPageV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "wallets",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "schedulePageV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "terms",
            "type": {
              "vec": {
                "defined": {
                  "name": "couponTerms"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "snapshotPageV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "claimedMask",
            "type": "u8"
          },
          {
            "name": "votedMask",
            "type": "u8"
          },
          {
            "name": "paidTotal",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "units",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    }
  ]
};

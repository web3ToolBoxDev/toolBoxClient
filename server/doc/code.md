# API Error Code Reference

## Task Service (1000~1099)
| Code  | Message Example                      | Description                       |
|-------|--------------------------------------|-----------------------------------|
| 1001  | Task name already exists             | Task name duplicate               |
| 1002  | Task does not exist                  | Task not found                    |
| 1003  | Task is running                      | Task already running              |
| 1004  | Delete task failed                   | Task deletion error               |
| 1005  | No wallet                            | No wallet provided                |
| 1006  | WebSocketService not initialized     | WebSocket not ready               |
| 1007  | initWalletsTask error                | Wallet initialization error       |
| 1008  | openWallet error                     | Wallet open error                 |
| 1009  | getConfigInfo error                  | Config query error                |
| 1010  | setConfigInfo error                  | Config update error               |

## FingerPrint Service (2000~2099)
| Code  | Message Example                      | Description                       |
|-------|--------------------------------------|-----------------------------------|
| 2001  | loadFingerPrints failed              | Fingerprint file load error       |
| 2002  | No fingerprint data available        | No fingerprint data               |
| 2003  | failed to get fingerprint count      | Count query error                 |
| 2004  | Invalid counts parameter             | Parameter error                   |
| 2005  | No fingerprints found                | No fingerprints in DB             |
| 2006  | Error fetching fingerprints          | DB query error                    |
| 2007  | Invalid parameters                   | Parameter error                   |
| 2008  | Environment not found                | Env not found                     |
| 2009  | updateFingerPrintName error          | Name update error                 |
| 2010  | Invalid parameters                   | Parameter error                   |
| 2011  | deleteFingerPrints error             | Delete error                      |
| 2012  | Invalid parameters                   | Parameter error                   |
| 2013  | Environment not found                | Env not found                     |
| 2014  | getEnvById error                     | Env query error                   |
| 2015  | Invalid parameters                   | Parameter error                   |
| 2016  | Environment not found                | Env not found                     |
| 2017  | setEnvById error                     | Env update error                  |
| 2018  | Invalid parameters                   | Parameter error                   |
| 2019  | Incomplete proxy parameters          | Proxy param error                 |
| 2020  | Environment not found                | Env not found                     |

## Proxy Service (4000~4099)
| Code  | Message Example                      | Description                       |
|-------|--------------------------------------|-----------------------------------|
| 4001  | IP address or port is missing        | Proxy param missing               |
| 4002  | Proxy creation failed: URL is empty  | Proxy URL error                   |
| 4003  | Invalid proxy URL                    | Proxy URL format error            |
| 4004  | Proxy request failed: ...            | Proxy request error               |
| 4005  | No IP found in proxy response        | Proxy response error              |
| 4006  | Proxy check exception                | Proxy check error                 |
| 4007  | Proxy check failed: unknown error    | Unknown proxy error               |

## Wallet Service (3000~3099)
| Code  | Message Example                      | Description                       |
|-------|--------------------------------------|-----------------------------------|
| 3001  | Invalid wallet count                 | Wallet creation parameter error  |
| 3002  | Save path fetch failed               | Save path retrieval error        |
| 3003  | Insert wallet error                  | Database insert error            |
| 3004  | Wallet not found                     | Wallet query error               |
| 3005  | Wallet updated                       | Wallet update success            |
| 3006  | Wallet export failed                 | Export error                     |
| 3007  | Import file format error             | Import format error              |
| 3008  | No wallet updated (init callback)    | Init callback updated none       |
| 3009  | Open-wallet dispatch failed          | Open task dispatch error         |
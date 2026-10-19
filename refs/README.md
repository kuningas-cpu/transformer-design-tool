# 厂商参考设计 PDF（V3 对账用）

这些文件只用于核对 V3 工具的匝比、磁通、复位/钳位和输出电感，不参与运行时计算。
文件名保留厂商原始命名，便于追溯；下表给出每个拓扑实际用到的量。

## 文件与来源

| 拓扑 | 文档 | 本仓库文件 | 关键数据 |
|---|---|---|---|
| 正激（复位绕组） | ON Semi EVBUM2133-D，NCP1216A，36~72 V→12 V/3 A | `EVBUM2133-D.PDF` | Np 35 / Ns 25，n=1.40，EFD25 |
| 半桥 | TI AN-2025 / LM5039EVAL，36~75 V→3.3 V/30 A | `snva423c.pdf` | T1 8:2，n=4，D@36 V≈0.422 |
| 全桥（PSFB） | Infineon REF_XDP_1000W_GAN_PSFB，360~420 V→12 V/1 kW | `infineon-referencedesign-ref-xdp-1000w-gan-psfb-applicationnotes-en.pdf` | Np/Ns=11.0，单管 D≈0.19 |
| 推挽 | TI AN-1861 / LM25037EVB，16~32 V→5 V/10 A | `snva352c.pdf` | 副边 2 只二极管，2:1，n=2，D@16 V≈0.344 |
| 推挽（电流馈，补充） | TI AN-1299 / LM5041 EVB，36~80 V→3.3 V/50 A | `snva074a.pdf` | 电流馈推挽，仅作拓扑/复位参考 |
| LLC | TI TIDT101 / PMP30522，310 VAC→38 V/2 A | `tidt101.pdf`、`tidrzi6.pdf` | T1 Lm=160.5 µH，C15=150 nF，n=2.016 |
| LLC（设计指南） | ST LLC Resonant Half-Bridge Converter Design Guideline | `cd00143244-llc-resonant-half-bridge-converter-design-guideline-stmicroelectronics.pdf` | FHA 增益曲线、k/Q 选取 |
| LLC（补充） | ON Semi AND90061，NCP4390 半桥 LLC | `AND90061-D.PDF` | 谐振腔/同步整流设计 |
| ACF（第一参考） | TI UCC28780EVM-002，90~264 VAC→20 V/2.25 A，45 W | `tidt096a.pdf`、`slua871.pdf`、`ucc28780.pdf` | Lm 104~127 µH（BOM 115），匝比 1:0.19，650 V GaN |
| ACF（第二参考） | ON Semi DN05119/D，NCP1568，60 W 通用输入 5/9/15/20 V | `dn05119.pdf` | T1 Würth 750317295（RM8/LP）；T2 330 µH/12T；NCP51530 + NCP4306 |
| 反激（设计方法） | PI AN-32 TOPSwitch-GX Flyback Design Methodology | `an31.pdf` | DCM/CCM、RCD、变压器设计流程 |

## 可直接打开的链接

- DN05119/D（ON Semi，PDF）：<https://www.onsemi.cn/download/design-notes/pdf/dn05119.pdf>
  - onsemi.com 的镜像：<https://www.onsemi.com/pub/Collateral/DN05119.PDF>（部分网络/爬虫会返回 403，浏览器直接打开通常可用）
- EVBUM2133-D：<https://www.onsemi.com/pub/Collateral/EVBUM2133-D.PDF>
- Infineon 1 kW PSFB：<https://www.infineon.com/assets/row/public/documents/24/42/infineon-referencedesign-ref-xdp-1000w-gan-psfb-applicationnotes-en.pdf>
- TI LM5039EVAL（AN-2025）：<https://www.ti.com/lit/pdf/snva423>
- TI LM25037EVB（AN-1861）：<https://www.ti.com/lit/ug/snva352c/snva352c.pdf>
- TI PMP30522 / TIDT101：<https://www.ti.com/lit/ug/tidt101/tidt101.pdf>
- TI TIDT096（45 W ACF）：<https://www.ti.com/lit/pdf/tidt096>
- TI SLUA871（UCC28780 ACF）：<https://www.ti.com/lit/pdf/slua871>
- ST LLC 设计指南：<https://www.st.com/resource/en/application_note/cd00143244-llc-resonant-half-bridge-converter-design-guideline-stmicroelectronics.pdf>
- ON Semi AND90061：<https://www.onsemi.com/download/application-notes/pdf/and90061-d.pdf>

## 对账结论（V3）

| 拓扑 | 厂商量 | 工具 | 判定 |
|---|---|---|---|
| 正激 EVBUM2133 | Np/Ns=1.40 | 1.44（+2.9%） | 通过；Np 绝对值差异来自 ΔB 口径（稳态 V·t vs 最恶劣 Vin_max·D_max） |
| 半桥 LM5039EVAL | n=4.00 | 4.00 | 通过 |
| 全桥 1 kW PSFB | n=11.0 | 10.94 | 通过 |
| 推挽 LM25037EVB | n=2.00 | 2.00 | 通过 |
| LLC PMP30522 | n=2.016，Lm=160.5 µH，Cr=150 nF | n=2.016，Lm=176.9 µH（+10%），Cr=136.2 nF（−9%） | 通过（同一 fr/k/Q） |
| ACF UCC28780EVM | n=5.26 | 5.277（−0.3%） | 通过 |
| ACF DN05119/D | T1 750317295（RM8/LP），60 W | 作为第二厂商交叉参考 | BOM 未直接列 T1 匝数/Lm；以 Würth 规格书或实测为准，不把提取不到的值当实测 |

## 说明

- `dn05119.pdf` 从 onsemi.cn 镜像取得（4.39 MB，43 页）；PDF 文本层里 T1 的 BOM 行被提取成“120 uF”，明显是版式/OCR 误读，**不要**把 120 µF 当变压器参数。
- 所有厂商值只在回归脚本里作为外部锚点；工具本身仍按用户输入计算。
- 新增/替换参考设计时，把 PDF 放进本目录，并在上表补一行“文档 + 关键量 + 链接”。

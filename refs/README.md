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
| ACF（第二参考） | ON Semi DN05119/D，NCP1568，60 W 通用输入 5/9/15/20 V | `dn05119.pdf`、`750317295.pdf` | T1 Würth 750317295（RM8/LP）：24T 中心抽头初级（12T+12T）、L(4-6)=120 µH、20V/4T、15V/3T；T2 330 µH/12T |
| 反激（设计方法） | PI AN-32 TOPSwitch-GX Flyback Design Methodology | `an31.pdf` | DCM/CCM、RCD、变压器设计流程 |

## 可直接打开的链接

- DN05119/D（ON Semi，PDF）：<https://www.onsemi.cn/download/design-notes/pdf/dn05119.pdf>
  - onsemi.com 的镜像：<https://www.onsemi.com/pub/Collateral/DN05119.PDF>（部分网络/爬虫会返回 403，浏览器直接打开通常可用）
- Würth 750317295 变压器规格书（已归档为 `750317295.pdf`）：<https://www.we-online.com/components/products/datasheet/750317295.pdf>
- EVBUM2133-D：<https://www.onsemi.com/pub/Collateral/EVBUM2133-D.PDF>
- Infineon 1 kW PSFB：<https://www.infineon.com/assets/row/public/documents/24/42/infineon-referencedesign-ref-xdp-1000w-gan-psfb-applicationnotes-en.pdf>
- TI LM5039EVAL（AN-2025）：<https://www.ti.com/lit/pdf/snva423>
- TI LM25037EVB（AN-1861）：<https://www.ti.com/lit/ug/snva352c/snva352c.pdf>
- TI PMP30522 / TIDT101：<https://www.ti.com/lit/ug/tidt101/tidt101.pdf>
- TI TIDT096（45 W ACF）：<https://www.ti.com/lit/pdf/tidt096>
- TI SLUA871（UCC28780 ACF）：<https://www.ti.com/lit/pdf/slua871>
- ST LLC 设计指南：<https://www.st.com/resource/en/application_note/cd00143244-llc-resonant-half-bridge-converter-design-guideline-stmicroelectronics.pdf>
- ON Semi AND90061：<https://www.onsemi.com/download/application-notes/pdf/and90061-d.pdf>

## Würth 750317295 关键参数（从规格书原图读出）

| 项目 | 数值 | 说明 |
|---|---|---|
| 初级 | 4-5-6，12T + 12T（中心抽头 5） | 4-6 为完整 24T；半桥 ACF 每半只用 12T |
| L(4-6) | **120 µH ±10%** @10 kHz, 100 mVAC | 这是完整 24T 的电感；单半约 30 µH（按 N² 估算，实际以半绕组实测为准） |
| 漏感（4-6） | **4.0 µH typ / 7.0 µH max** | 测试条件：tie 8+9、S1+S2+F1+F2，100 kHz，10 mVAC |
| 20 V 副边 | S1-F1，**4T** | (4-6):(S1-F1) = 6:1（全初级 24T : 4T） |
| 15 V 副边 | S2-F2，**3T** | (4-6):(S2-F2) = 8:1 |
| AUX | 9-8 = 3T；8-7 = 8T | (4-6):(9-8)=8:1；(4-6):(8-7)=3:1 |
| 饱和电流 | 4.5 A（20% 电感跌落） | 4-6 |
| DCR | 4-6 0.152 Ω；7-8 0.335 Ω；8-9 0.068 Ω；S1-F1 0.016 Ω；S2-F2 0.312 Ω | @20°C |
| 匝间电容 | 25 pF typ（6-F2） | — |
| 隔离 | 3000 VAC 1 min / 3750 VAC 1 s | 6-F2 |
| 工作温度 | -40~+125°C（含温升） | — |

**匝比口径（很重要）**：DN05119 的 T1 是中心抽头初级，半桥 ACF 每半周期只用 12T。
因此对 20 V/4T：

- 按**全初级 24T** 看，n = 24/4 = **6**（规格书 turns ratio 表的写法）；
- 按**半桥每半 12T** 看，n = 12/4 = **3**（实际开关工作的有效匝比）。

工具的 ACF 模型是“单初级 + 钳位开关”口径；拿 DN05119 对账时，应明确用 n=3（每半）还是 n=6（全初级），
不能把两个口径混用。DN05119 的 100 kHz、110~375 VDC 与 20 V/3.25 A 也在其 Magnetic Design 页给出。

**用工具验证后的结论**：按 110~375 VDC、20 V/3.25 A、600 V 管、Lk=4 µH、Fs=100 kHz、D=0.36 跑，
工具给 `nTarget = 3.018`、`Vds,pk ≈ 500.6 V`，与 600 V 管（0.85×600=510 V）吻合；
若强行按全初级 n=6（D≈0.53），工具的 ACF 硬限会把它压到 `D ≤ 0.489`、`n ≤ 5.14`，
说明 **6:1 只是数据表的全绕组比，不是该板 ACF 的实际工作匝比**。
V3 已新增 `acfMode=ct` 子模式：Np 填总匝数，内部 Nph=Np/2；磁通/Lm/ZVS 用 Nph，窗口/铜面积用 Np_total。

## 对账结论（V3）

| 拓扑 | 厂商量 | 工具 | 判定 |
|---|---|---|---|
| 正激 EVBUM2133 | Np/Ns=1.40 | 1.44（+2.9%） | 通过；Np 绝对值差异来自 ΔB 口径（稳态 V·t vs 最恶劣 Vin_max·D_max） |
| 半桥 LM5039EVAL | n=4.00 | 4.00 | 通过 |
| 全桥 1 kW PSFB | n=11.0 | 10.94 | 通过 |
| 推挽 LM25037EVB | n=2.00 | 2.00 | 通过 |
| LLC PMP30522 | n=2.016，Lm=160.5 µH，Cr=150 nF | n=2.016，Lm=176.9 µH（+10%），Cr=136.2 nF（−9%） | 通过（同一 fr/k/Q） |
| ACF UCC28780EVM | n=5.26 | 5.277（−0.3%） | 通过 |
| ACF DN05119/D | T1 750317295：24T 中心抽头（12T+12T），L(4-6)=120 µH，20V/4T | 作为第二厂商交叉参考 | 全初级 n=6；半桥每半 n=3。工具对账时必须注明口径，不能把 6:1 直接当成每半的有效 n |

## 说明

- `dn05119.pdf` 从 onsemi.cn 镜像取得（4.39 MB，43 页）；PDF 文本层里 T1 的 BOM 行被提取成“120 uF”，明显是版式/OCR 误读，**不要**把 120 µF 当变压器参数。
- 所有厂商值只在回归脚本里作为外部锚点；工具本身仍按用户输入计算。
- 新增/替换参考设计时，把 PDF 放进本目录，并在上表补一行“文档 + 关键量 + 链接”。

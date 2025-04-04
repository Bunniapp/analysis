export type Category = "Retail" | "MEV Bot" | "Bunni Bot";

export interface Label {
    name: string;
    category: Category;
}

export const LABELS: Record<string, Label> = {
    "0x0000000000001ff3684f28c67538d4d072c22734": { name: "0x Allowance Holder", category: "Retail" },
    "0x0000002c67d68170c8ce06fe78d7e37895c41255": { name: "Bunni Arb Bot", category: "Bunni Bot" },
    "0x000000ca9c71cdb00bcd795fc43cf1028952310b": { name: "Bunni Arb Bot", category: "Bunni Bot" },
    "0x5093ef099346ffe58283207e221dada47bfd862a": { name: "MEV Bot (0x5093ef)", category: "MEV Bot" },
    "0xeeeeee9ec4769a09a76a83c7bc42b185872860ee": { name: "Relay Router", category: "Retail" },
    "0xa1bea5fe917450041748dbbbe7e9ac57a4bbebab": { name: "Relay Router", category: "Retail" },
    "0x2d5805a423d6ce771f06972ad4499f120902631a": { name: "MEV Bot (0x2d5805)", category: "MEV Bot" },
    "0x0000000071727de22e5e9d8baf0edac6f37da032": { name: "ERC-4337 Entry Point", category: "Retail" },
    "0xfb33f10738d6e83a049678c1fcb9eb8b78d1417f": { name: "0x MetaTxn Settler", category: "Retail" },
    "0x9ed181da6b359c3ee23c1d6912a6b4b0c349a165": { name: "0x MetaTxn Settler", category: "Retail" },
    "0x52a7614e473599e1f040173c35a8a2a27f28f36d": { name: "0x MetaTxn Settler", category: "Retail" },
    "0x0d0e364aa7852291883c162b22d6d81f6355428f": { name: "0x Settler", category: "Retail" },
    "0xacff4cabde48944b89eb652a3b90e7bcef7dddac": { name: "MEV Bot (0xacff4c)", category: "MEV Bot" },
    "0x9008d19f58aabd9ed0d60971565aa8510560ab41": { name: "CowSwap", category: "Retail" },
    "0x5c9bdc801a600c006c388fc032dcb27355154cc9": { name: "0x Settler", category: "Retail" },
    "0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251": { name: "deBridge", category: "Retail" },
    "0xf1ceb16d94083606db7f4d98400554f17125483b": { name: "MEV Bot (0xf1ceb1)", category: "MEV Bot" },
    "0xaaaaaaae92cc1ceef79a038017889fdd26d23d4d": { name: "Relay Approval Proxy", category: "Retail" },
    "0x77a917df7a084b7b3e43517ae28373c2a5492625": { name: "Relay Approval Proxy", category: "Retail" },
    "0x00000000009726632680fb29d3f7a9734e3010e2": { name: "Rainbow Router", category: "Retail" },
    "0x3a23f943181408eac424116af7b7790c94cb97a5": { name: "Socket Gateway", category: "Retail" },
    "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": { name: "LiFi Diamond", category: "Retail" },
    "0x6307119078556fc8ad77781dfc67df20d75fb4f9": { name: "LiFi Permit2 Proxy", category: "Retail" },
    "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789": { name: "ERC-4337 EntryPoint", category: "Retail" },
    "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f": { name: "Zerion Router", category: "Retail" },
    "0x7ae782dcb73d02b0510e9bdb5d5720b5c493dcbd": { name: "UniswapX Filler (0x7ae782)", category: "Retail" },
    "0x926cf2166e091c8617d8037431a9c572186f18db": { name: "MEV Bot (0x926cf2)", category: "MEV Bot" },
    "0xc254681c78bd154306954ebd5e8b38e43e3c83b7": { name: "MEV Bot (0xc25468)", category: "MEV Bot" },
    "0xa20ecbc821fb54064aa7b5c6ac81173b8b34df71": { name: "Metamask Bridge", category: "Retail" },
    "0x0439e60f02a8900a951603950d8d4527f400c3f1": { name: "Metamask Bridge", category: "Retail" },
    "0xa6a147946facac9e0b99824870b36088764f969f": { name: "Maestro Router", category: "Retail" },
    "0xf9d64d54d32ee2bdceaabfa60c4c438e224427d0": { name: "Gelato", category: "Retail" },
    "0xc6f00fe98bd441b8b482781dc4721443ec645c0e": { name: "Daimo Pay Relayer", category: "Retail" },
    "0xca11bde05977b3631167028862be2a173976ca11": { name: "Multicall3", category: "Retail" },
    "0x6ff5693b99212da76ad316178a184ab56d299b43": { name: "Universal Router", category: "Retail" },
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": { name: "Universal Router", category: "Retail" },
    "0xbeb0b0623f66be8ce162ebdfa2ec543a522f4ea6": { name: "Bebop Settlement", category: "Retail" },
    "0x0e18099e088d31af1b754666038a713cf3b7422b": { name: "Mayan Fulfiller", category: "Retail" },
    "0x337685fdab40d39bd02028545a4ffa7d287cc3e2": { name: "Mayan Forwarder", category: "Retail" },
    "0x952d7a7eb2e0804d37d9244be8e47341356d2f5d": { name: "FlashBorrowerSolver", category: "Retail" },
    "0x4025ee6512dbbda97049bcf5aa5d38c54af6be8a": { name: "Railgun WETH Helper", category: "Retail" },
    "0x00000047bb99ea4d791bb749d970de71ee0b1a34": { name: "TransitSwap Router v5", category: "Retail" },
    "0xfaa763790b26e7ea354373072bab02e680eeb07f": { name: "DeFiSaver v3 StrategyExecutor", category: "Retail" },
    "0x62496bdf47de3c07e12f84a20681426abcc618e2": { name: "DCAKeep3rJob", category: "Retail" },
    "0x0c9a3dd6b8f28529d72d7f9ce918d493519ee383": { name: "Euler Vault Connector", category: "Retail" },
    "0xc868bfb240ed207449afe71d2ecc781d5e10c85c": { name: "Gnosis Safe (0xc868bf)", category: "Retail" },
    "0x7161f940d3ca88e4035d7b7fbde2a2870d176f87": { name: "MEV Bot (0x7161f9)", category: "MEV Bot" },
    "0x9fdad0be5e7dd7c9842fd7d11e2fe8f7c06ff9b7": { name: "MEV Bot (0x9fdad0)", category: "MEV Bot" },
    "0xf00000003d31d4ab730a8e269ae547f8f76996ba": { name: "MEV Bot (0xf00000)", category: "MEV Bot" },
    "0xa090fc409a9f25bf8e28257d42ef6904590c8984": { name: "MEV Bot (0xa090fc)", category: "MEV Bot" },
    "0xb3445d5413abf63df1112a4a517de2602f249785": { name: "MEV Bot (0xb3445d)", category: "MEV Bot" },
    "0x4f1c0915352a55f70e1644f3917e3fa6a9dcd037": { name: "MEV Bot (0x4f1c09)", category: "MEV Bot" },
    "0x9d6b911199b891c55a93e4bc635bf59e33d002d8": { name: "MEV Bot (0x9d6b91)", category: "MEV Bot" },
    "0xd28fb411e9b004feef57312c12f892504dcd5463": { name: "MEV Bot (0xd28fb4)", category: "MEV Bot" },
    "0x7332afc063f43e86457ec971c5fd37e8428f0a06": { name: "MEV Bot (0x7332af)", category: "MEV Bot" },
    "0xee14d52f7544f84748eea641b9b616bd65aab073": { name: "MEV Bot (0xee14d5)", category: "MEV Bot" },
    "0x684feb71dd32e6a36c39d47fcef6a559877ad7d3": { name: "MEV Bot (0x684feb)", category: "MEV Bot" },
    "0x49e27d11379f5208cbb2a4963b903fd65c95de09": { name: "MEV Bot (0x49e27d)", category: "MEV Bot" },
    "0x6704713b32cb1b3e89b0cf7d77417807061bdeb8": { name: "MEV Bot (0x670471)", category: "MEV Bot" },
    "0x13cf8829d2eaf6a70a33c6b9bb67b6c2f5d135be": { name: "MEV Bot (0x13cf88)", category: "MEV Bot" },
    "0xec67ad9721f3856ec8c474032fd722122f91fdb8": { name: "Definitive Vault", category: "Retail" },
    "0x9307a1e9b667daa65c3ec808d16a696a70076584": { name: "Definitive Vault", category: "Retail" },
    "0x3fcf39eca3a6277f9d7c4aa6764c89e325135da8": { name: "Definitive Vault", category: "Retail" },
    "0x26b5f10ce933cbdfed0f06fbed77df31c4a17fa7": { name: "Definitive Vault", category: "Retail" },
    "0x144c34673f20e755572f26bf4ea8915120d168e4": { name: "Definitive Vault", category: "Retail" },
    "0x11404175a8e87cc682aa905de165e70d25ad979a": { name: "Definitive Vault", category: "Retail" },
    "0xbdf03b77d06fc4e1b02ebde6ad565e3a171700b8": { name: "Definitive Vault", category: "Retail" },
    "0x08c8315549f059ab63e95d0c70770582e2fa80cb": { name: "Definitive Vault", category: "Retail" },
    "0xb2d09700058e2b972da337cd12aab1a2650cfa2e": { name: "Definitive Vault", category: "Retail" },
    "0x870eb3264e81edbea04c83758b4a9d15149248d6": { name: "Definitive Vault", category: "Retail" },
    "0x3df3fa92258660b4988bba76505e9560d54cd555": { name: "Definitive Vault", category: "Retail" },
    "0x2adfb8257dde3be07204f0020761f70bfb13985a": { name: "Definitive Vault", category: "Retail" },
    "0xdd3bd9a7811bf236c460fd1b32da6c59c7f2c63c": { name: "Definitive Vault", category: "Retail" },
    "0x046d1ceb830f3545438e12f0e1b45b8ab4f200f2": { name: "Definitive Vault", category: "Retail" },
    "0x8bbcc8d79d6a18b1fc3f957911235c115a72c4c8": { name: "Definitive Vault", category: "Retail" },
    "0xaa8fc25fda37281f07ebb013030ad5070597e54d": { name: "Definitive Vault", category: "Retail" },
    "0x82d3a471943ff652ddb46375081de04848d2fcd4": { name: "Definitive Vault", category: "Retail" },
    "0xb60f149981b3510d67e894d3175f90b979dcde7e": { name: "Definitive Vault", category: "Retail" },
    "0xd312f8f0a7fe320e956e745a6da8a83d1be064f0": { name: "Definitive Vault", category: "Retail" },
    "0x2fa2ab69c54ad2631606f1f1498322944958a6b8": { name: "Definitive Vault", category: "Retail" },
    "0x9041a41ce9776003351c5f39a07b3c7a77ffa527": { name: "Definitive Vault", category: "Retail" },
    "0x0d7ec2f061caf23c1539fe7bf4ab57e9b1379099": { name: "Definitive Vault", category: "Retail" },
    "0x56f99145c9ce4b0372c4998726cec2d1b74ebd9a": { name: "Definitive Vault", category: "Retail" },
    "0xf372d70c8de91eaa72b4f3d3db469a5629e7458b": { name: "Definitive Vault", category: "Retail" },
    "0x00cf986b6670308846cdbae1894cbde22c584f93": { name: "Definitive Vault", category: "Retail" },
    "0xdf11263e8bc6f6e56cd08a6387bb2d7e3cea1961": { name: "Definitive Vault", category: "Retail" },
    "0xb9f1eee338f15ce70dc7ae45afe49c4b79f530cc": { name: "Definitive Vault", category: "Retail" },
    "0x8d5bf3fe7bbfd850b70234d59691d6f6bdca41d0": { name: "Definitive Vault", category: "Retail" },
    "0x2cafd066aaccaf83325780573ac79a47b06b3bf9": { name: "Definitive Vault", category: "Retail" },
}
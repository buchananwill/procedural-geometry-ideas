/**
 * Pinned by `single-loop-scene-digests.test.ts` (dashboard holed-fixtures spec, decision 42): a SHA-256 of the
 * straight-skeleton page's scene for every `FULL_CORPUS` fixture, every debug flag off and every flag on, measured on
 * the tree before the first edit to the dashboard for roadmap node 7, against core and the fixtures built at `63461a8`.
 */
export const SINGLE_LOOP_SCENE_DIGESTS: Record<string, { off: string; on: string }> = {
    "Triangle": {
        off: '9c6f6a7493e851ebdd22601a17ed3f8f6274f279114d6a760f2b27ab64b4e012',
        on: 'ccc88ce6595241829c2b95420520f6624f43a8b59ce3e273949816e9c0843f07',
    },
    "Square": {
        off: '75a455500f651681d62f46c39f4e67d00ee7c12a888cf160b2bc089122e3e50b',
        on: 'a90779a411a64c8b22bea2a9abdad1e89f0c40bb64bc47f8184ef13b2e5c5538',
    },
    "Rectangle": {
        off: 'd1848b89fe7e261794b63beae615542da50e39102f3da3a60b9231df79cedb5b',
        on: 'f7db4c2c752f075ba563282f516e0b45bbb564579d9c06ead7b62c440e9bc99f',
    },
    "Pentagon House": {
        off: '7b1a323794e5ff758edd94a21c930f8aec1db081f8256d4c75873601e390930c',
        on: '0d6acd539ca5baaa87b630a443ba55f39c70b587c53770cbc3f9bb12a675ca17',
    },
    "Default Pentagon": {
        off: 'b98700b409475a211d5dc3f66b2f9a4849799d314268a66d38053891537edff5',
        on: '6fa1be9cb73c3f3e23a82f821dd0647a9af795df0b24d376a27c25f9022d86a9',
    },
    "Symmetrical Octagon": {
        off: 'a511d7d8689041cf8bee6d33f29af8d1c2fb1159ff9b54a3dcd2a1fdea220d54',
        on: 'b4f3ed4ff0bd4aedcefb758ea5183f0aac00a2a6653e855417d3c29f0ae59c7f',
    },
    "Awkward Hexagon": {
        off: 'ac69d18b2df8272fa5e14829b751e437bdcc242691da839a443af3045dbe4b50',
        on: '22c9d154a715806d2e41f82d3fbbbaa21a006e5b5bf33d2892cc24c54164fd3e',
    },
    "Awkward Heptagon": {
        off: '65700e83bb691c5d043a8c4521cb9a92c0d3b31c63be935fa213623fbc325d5e',
        on: '894c708a858ae1bc08cd21b33151b81c1f8b661a621f20700b8ff11d1f2182b9',
    },
    "Impossible Octagon": {
        off: 'c18339240d6a282d7f446005c0135b3110cfd5a3d6324ac17978e6ae6502b9e1',
        on: 'e6cfae4a8d98f8544e61d6b3f9392194e61756832d1db41570920b5cdda71892',
    },
    "Broken Polygon": {
        off: '545bb98d533fb2f56b8012ef86f92de66bc12726edce862a1f4f41d3e79355b9',
        on: 'ce69e5d5dc480719ecf8af81c9289c05dd482473389533961205b2668b5108e9',
    },
    "Crazy Polygon": {
        off: '31f3e279f10e4076ba3903212133d0bb3aa481708bf188c12e38e8b253df3d76',
        on: 'aa740e805fe21dff840dc0fa42f3b310c6cf2e7a55fcdfeeb32b6e63b72ad81e',
    },
    "Duck Octagon (fails)": {
        off: '9bd334dbc94007b7668c9a982508e095a3f058a5848b23d2df07bbebb7431774',
        on: '8f83bc7740554188c0751b7677622654b76f0ad288fb9acc3423d0aa62354622',
    },
    "Duck Octagon (passes)": {
        off: 'a010b0e12ff6a8cefa4f46e06f592be8cae70fb1b6392e707d5e22b9eb9f5113',
        on: 'ee07ac102ed20019a986547e3f0a023665c282134b63dca8f12fd20dfbae5b05',
    },
    "Moorhen (fails)": {
        off: '532f914a4b9e41d74fecab5189735ec14594fe02bc8630afe35144c40b8632c9',
        on: '0c2c28fc3f95b1f99b57b7d88038b18efc0fb0d8c8e453e1362d3251a663299b',
    },
    "Moorhen (passes)": {
        off: 'cab2b48e09e3b32f6a2efdad3bfba1d3ad404f81733cc089266bfbda179c6b3a',
        on: '87be2a7aec4400bc721948554a20011a9a30dd70306061bdeb0d360fb0fa2b96',
    },
    "V2 Double Reflex Spaceship (fails)": {
        off: '94fff346c6e327b71f6b370a50949fc3b4c6c4293be4406d09924e78a5e0ec22',
        on: '3b1f2817d2ae0ddf54ba752be5dfb741dc436e59635195126f56dc7c6027b161',
    },
    "Previously failed Double Reflex Spaceship (passes)": {
        off: '8d1d56374412d40ed0674a758f18232dab4b1c88f6ff874b619c1ea5f1227f0d',
        on: 'ed3e4551f3b73da3af91220f8a889a9f84c2fcc23c360b8809e37cbdb67d9a30',
    },
    "Double Reflex Spaceship (passes)": {
        off: '599ed610112ca557d1edbb3c1943041325eca47076307a5c2f89d0fc801b90e4',
        on: 'e2e611563f70a4385a62a94f3e31d7ad865c57c19d12ceafc8cebee71c4170d2',
    },
    "Convergence Towards Isthmus (succeeds)": {
        off: 'ee2dd776a955c0e2ebf422e61fb147200f2531591418779ad026ab42f4b38856',
        on: 'a68e0ae237fe93bc77249ab6efe6ff4c41017e6cb1c34ca73557fe4d9d714ba9',
    },
    "Divergence Towards Isthmus (fails node 7)": {
        off: 'bc31f909f85e43ed0ae9440904eeb3b8d2c84bc5dbdd5f265a0f4625a7b3a29b',
        on: '252ca53cb7b7e4f2661b269d71396427b2eda61fed91ad2fbd07b3b2f932810d',
    },
    "Divergence Towards Isthmus (fails node 4)": {
        off: '715945f8bb3820d0b43d754654523e1a052fd0ddd59e0d6004475633cc33f92f',
        on: '4d59db388db410986add1e88e064a6605f8c01d8288fe3ece32c6e2e7a30d705',
    },
    "Long Octagon": {
        off: 'f7eef888890ffb262ebed4f5a9bf92145c06d2d29810ba8c7d6949911637191b',
        on: '34fbec714b8b57db0601556ced9c1cb904ca249b6d9ffcf1fc8d9d006562db7f',
    },
    "Failing Long Octagon": {
        off: '808d2e63445204b86be0167064e961e41aab72fd8cfa6c579e83a58571d7d39a',
        on: '5014831c96a9284ba60f85d1751da1520b8ba22f9a695f25f5325bb893e2f93c',
    },
    "Failing Gentle Reflex Pentagon": {
        off: '1fc1524bbcd38f5ee8141e7b28fcca33467b2a5ae88fd80e3b6f64ff385331de',
        on: '278658496a2b69ec8ec4348f7c5a0bace7bb6eb43a7b3cadf7a4c7edac3412ed',
    },
    "Mid-case Success Outer": {
        off: '04db2d6eff5b692483c88efcbe85dfc29648acca6cb51b0876814b34da102621',
        on: '8caed2b65e4095eeb403c04b6f3c61e4221075953757601770b988b106547b27',
    },
    "Mid-case Failure Start": {
        off: 'a4ce210bcc101def7c235db904156982602f913a7549669814cdd2034df64319',
        on: 'acadf8e242a0927e7e5b27df962dffd12bc0ff3a9cfc4050e5cea35d9c22ad8f',
    },
    "Mid-case Failure End": {
        off: '72f3856fd74794d09491f8fce7decfc34d0523d2d8e9a04f0a497a128479bee9',
        on: 'cb6280729a3ce0a7dc7e898436177282ed25c0fc0f5645007a9808aa26df1573',
    },
    "Mid-case Success Inner": {
        off: 'f674b05b837207e52c73448a16de51983f0769eeb5df68771c5b1c67e7c1df6d',
        on: '1f20ed14df1bd308ee561de23821c60cf96850a5c745c78a089f14025e818484',
    },
    "Missing Edge at Node 11": {
        off: '8703d172f4ba8e95e2d25279261f4c6b2d8df181d326ed7c4b15416324dd9dce',
        on: 'e2c80e8b27c25cfde20c4692e65022190677c222d33235feb498e1241d799950',
    },
    "Causes Missing Secondary Edge": {
        off: '90f212b1dfc85bcdf70f37dd0375fddcea69213e2e5426a98f41501f27381997',
        on: 'f1d569f8276df4cd81254622c4fe1aadb6879db73c7ac5e2aa11426f4321cb61',
    },
    "Wacky Octagon": {
        off: 'bf7dcddb9e0465a7c592aacbe35e2bae9ba1e808678f8695ffef359841f55b49',
        on: '2a3c6f50ca229e94b83bfd4a63a1c57f80c7d6a8447daa34ff9c7f6929e0a8d1',
    },
    "Not Solvable Heptagon": {
        off: '35a238547d347f64d9a38c4e9cdd147b4ccb1df7d241399c1e57dd73ed91276b',
        on: '71246c76f057e60ccb0d47aa971f2d524d5b5526df34255eb366e35c5b4412fa',
    },
    "Wrong Collision at Node 10": {
        off: '10c7b122c1899d269fcceef412a825022bb83227c847c63f30141e3f211343f4',
        on: '7cf0e7b626a1c872480a1084dd4275cb3bd36db3f8dba7c9b066cb3a939f7b27',
    },
    "Premature Split Octagon": {
        off: '8703d172f4ba8e95e2d25279261f4c6b2d8df181d326ed7c4b15416324dd9dce',
        on: 'e2c80e8b27c25cfde20c4692e65022190677c222d33235feb498e1241d799950',
    },
    "Long Unbroken Side Then Extreme Acute Angle": {
        off: '029152e03c571e691b843b8d1116739989e9f6c13269589519708a80c1647264',
        on: 'b3fb844c14c50d575194ff7d7c970e6b128f3249c4ddea8e300380860253ceca',
    },
    "Incorrect Ordering e38-e30 Collision": {
        off: '7c47ce5c462fe2b598c6c5d62da8298ba48ce3a485d3056dc17a53452b38c8ab',
        on: 'e72a20b594bdbea1e47f27c0644b114883924432248aa63887241a460bbf4d4a',
    },
    "Premature Bisector Split (fails)": {
        off: '868cc01b5846f64a4394b5b7117434b909deec1115f8fa6c81ef7e7bcb9d1a42',
        on: '7b94bfbfe6b2ce28ab74b1322044fbde59ace02515e1177590bb83f70f918e3b',
    },
    "Premature Bisector Split (passes)": {
        off: '79da7a4f0d2e6bf231743482f6be71ce8b7b4f95c25659c267263c23ec2f09a3',
        on: '962b5311f29f6aa1dad2c4c4bef9a5244f6b3891e893dbe1bdcdf86f426041c2',
    },
    "Short Edge Promontory": {
        off: '71ad7c452181fa680c1c97559284f108e9b98ff6aa3df13a7ea72f6b20cba336',
        on: '15c89db74072d933345e80cdbee149391435adef42ed0a6eea1b9dd3d64e8ea1',
    },
    "Cross": {
        off: '8f0117c5ae87c2b0a79abaa38fce936a83f66652575ad26b4832fb0566263fc5',
        on: 'c1a78ad27e0745ae052901257a9754d33079bc9a0a6662d25382d2a03aa1b2c3',
    },
    "T-Shape": {
        off: 'b9e111a0d89cad5571506a14b2eb8f57e3917828d5fdd68131eacd96ee6b69d6',
        on: '7d8d58bf177377e1d4d4a1bd07648beb94f11a1533b4bd256be1c9b8b29fc377',
    },
    "Golf Cart": {
        off: '7fe248aab73917e4930f62ca17d85deb4226ff2e5468c260f80898e9bb2f5d82',
        on: '3209677a16a450288a5f8c7c8a2dcca42fe4f9fde9a43bc4fdcd3119328c6a9a',
    },
    "Collinear Dumbbell": {
        off: 'a5f197ac7160588a72ec49eb3d1e9832681d69881dde9a8500c3283f5606ed47',
        on: '8ccabf2081e00d32bc42715ee609d6923f9b7828c1e8b848369bde24d130dae3',
    },
    "Asymmetric Dumbbell": {
        off: '2900a5e87c95d4a485980a5b4daa7a4fdab2631a096e9a7e9215888b29c6fb2f',
        on: '0806b6e09a56bac940148e21b301c9f33604deecd306b8e80136046d56627b1a',
    },
    "Three Globe Chain": {
        off: 'eb7d3dbc87ace753aa2367919a3a11509f77621525a55a2bd18943122daba634',
        on: 'ad04fabff75b7abd04a0691329cad22b857cb036c50cdbddf8dde6c0c534bc22',
    },
    "Near Regular Circle 16": {
        off: '163f5607a7626ef01c82e0849566355bf1966c0082bd413e9861c5726a692143',
        on: 'abf3fd01341c025fa803a902163200307a48952c0be27327ccd5da2f353506e5',
    },
    "Near Regular Circle 32": {
        off: '107b7767005ee642e0d3867708c8223fb1b059c73765bd8597ff298f183e005e',
        on: '81246533a1513ee770915063d40ea4abdfbe5a4863b4dc8d328f65d9e4a7f48f',
    },
    "Near Regular Peanut 32": {
        off: 'f398cb9cda9bbb6db3accf404bd36a876b51f455ad39b3e08c04cc50b301ecca',
        on: 'f0c2091ae288ec905509ea76fea79fb734e02583b0c7fcced67740ed4df087f1',
    },
    "Near Regular Ellipse 16": {
        off: '55dc1c0680ce476650e6bc34b41812560bf8e92795908a464ee06e672b8cc9e4',
        on: 'a7f46311c95f9923fb29f10ed9b66d7ed07da1afa7c5ef3e0e9598145cf05f3c',
    },
    "Near Regular Ellipse 32": {
        off: '5c5b588397f28206d7d21663e15f4730ca9690762a38983097ab54d4b1bebe7b',
        on: '90d41bab9d7e2a3463c2b5adfd2cc819e1b84113536cdb5b813d0fe7efb7458d',
    },
    "Invisible Vertex Rectangle": {
        off: 'eb19aaff42abe704cbb9973f34a2bec1d3e0114c739998b90cfa9920d2cb5313',
        on: '247e75b65775768438b8389a670cedd219ba5d9261ab2472e3f3162b1d540c78',
    },
    "Slightly Deformed Peanut 1": {
        off: '563c29bcfde15327d99b7898447e302659436936bcd5b02d616cd0d5a3a84586',
        on: '0fb2a2e86cdf3b580d76a48108a2e1e0d74abdec78b97016c3b6db8679539865',
    },
    "Slightly Deformed Peanut 2": {
        off: 'b26207f96449891f68dcedfe528c160814c5962101605b15821ff4e5f07c7811',
        on: 'd0a378ce511b9d3b1982db043362215d3bd6adbbb07fb703fb7ae5f2d949fed4',
    },
    "Off-edge Jitter Reflex L (seed 15838)": {
        off: '09e428ee7d8484abb821a5cc3adfac6f0935c085dae92513f80fb7566332cffe',
        on: 'e9e529182ba83a92c58c2533b759540d333351f1cbb76f3266cc9dbeaa6bd36d',
    },
    "Off-edge Jitter Reflex L (seed 55433)": {
        off: '5351dd42b68d03634e8ee3162c88992f588349f590de930450875b7d8bb0735f',
        on: '5dc3f8193c882e4baa838b25e2407c56d54305029994c71722141ad3afeede08',
    },
    "Off-edge Jitter Plus (seed 7919)": {
        off: 'ec6a2f43d17942d0fccf4bf91cdb504c3ffe080aeffd9416278918b0d53539ef',
        on: '67b3d4eae8a1a808d2e2582ed38a86e1bd52637beff364a087bbd1d2389bd8e2',
    },
    "Off-edge Jitter Reflex L (seed 55433, k=4)": {
        off: '39b01c797b47cd8f070fe8d0348e38ed3aaf385b397a6c7bbe087adee1dbbf30',
        on: '3b1541be1913e78009e16673f878ce6d384f450d2826e8c0c8c3e2e03f5cc154',
    },
    "Near Regular Circle 48": {
        off: 'd19fad37b50b5ae3fd74492687b00a7d5aef7d2d0b8634633463c5dc66b1f414',
        on: 'ed9f595b5b04c84aa87eab1016207124fe681bfc45894e044b0c81c465649a09',
    },
    "Near Regular Rosette5 40": {
        off: '6a1f18ca1bc2862c63dea9eb9447285f4ec37a159e3b0bd95cd5b86a8002eb36',
        on: '66ce7f6e70db88d20ab7ddf874b2cac3bfc288e152b0d8606f784de7c5a8fbd7',
    },
    "Offset Cross Junction": {
        off: '93b00de8ff4c5dbef038616665eac907a113ca2f62682017e2e802168b281d41',
        on: 'fe792119636e4a74820f11f4bfaca9a632bf656bf1cdbf53a02883640195c89e',
    },
};

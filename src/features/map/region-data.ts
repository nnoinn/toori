// 전국 시·군·구 동네 목록 (#200). scripts/build-regions.mjs가 만든 파일이라 손으로 고치지 않는다.
// 이름·코드: 행정표준코드관리시스템 법정동코드(현존), 중심 좌표: 카카오 로컬 API 주소 검색. 만든 날: 2026-11-02
// 동네를 고르는 화면·관심 동네·동네 쿠키 확인이 이 목록을 쓴다(regions.ts).

import type { RegionSido } from './regions';

export const REGION_SIDOS: readonly RegionSido[] = [
  {
    code: '51',
    name: '강원특별자치도',
    regions: [
      {
        code: '51110',
        name: '춘천시',
        sigungu: '춘천시',
        sido: '강원특별자치도',
        center: {
          lat: 37.881402,
          lng: 127.729772,
        },
      },
      {
        code: '51130',
        name: '원주시',
        sigungu: '원주시',
        sido: '강원특별자치도',
        center: {
          lat: 37.342048,
          lng: 127.920097,
        },
      },
      {
        code: '51150',
        name: '강릉시',
        sigungu: '강릉시',
        sido: '강원특별자치도',
        center: {
          lat: 37.752112,
          lng: 128.875906,
        },
      },
      {
        code: '51170',
        name: '동해시',
        sigungu: '동해시',
        sido: '강원특별자치도',
        center: {
          lat: 37.524742,
          lng: 129.114299,
        },
      },
      {
        code: '51190',
        name: '태백시',
        sigungu: '태백시',
        sido: '강원특별자치도',
        center: {
          lat: 37.164007,
          lng: 128.985725,
        },
      },
      {
        code: '51210',
        name: '속초시',
        sigungu: '속초시',
        sido: '강원특별자치도',
        center: {
          lat: 38.206894,
          lng: 128.591939,
        },
      },
      {
        code: '51230',
        name: '삼척시',
        sigungu: '삼척시',
        sido: '강원특별자치도',
        center: {
          lat: 37.449898,
          lng: 129.165112,
        },
      },
      {
        code: '51720',
        name: '홍천군',
        sigungu: '홍천군',
        sido: '강원특별자치도',
        center: {
          lat: 37.697167,
          lng: 127.888684,
        },
      },
      {
        code: '51730',
        name: '횡성군',
        sigungu: '횡성군',
        sido: '강원특별자치도',
        center: {
          lat: 37.491783,
          lng: 127.985071,
        },
      },
      {
        code: '51750',
        name: '영월군',
        sigungu: '영월군',
        sido: '강원특별자치도',
        center: {
          lat: 37.183686,
          lng: 128.461784,
        },
      },
      {
        code: '51760',
        name: '평창군',
        sigungu: '평창군',
        sido: '강원특별자치도',
        center: {
          lat: 37.370782,
          lng: 128.390162,
        },
      },
      {
        code: '51770',
        name: '정선군',
        sigungu: '정선군',
        sido: '강원특별자치도',
        center: {
          lat: 37.380584,
          lng: 128.660814,
        },
      },
      {
        code: '51780',
        name: '철원군',
        sigungu: '철원군',
        sido: '강원특별자치도',
        center: {
          lat: 38.146792,
          lng: 127.31338,
        },
      },
      {
        code: '51790',
        name: '화천군',
        sigungu: '화천군',
        sido: '강원특별자치도',
        center: {
          lat: 38.106182,
          lng: 127.708151,
        },
      },
      {
        code: '51800',
        name: '양구군',
        sigungu: '양구군',
        sido: '강원특별자치도',
        center: {
          lat: 38.110001,
          lng: 127.989951,
        },
      },
      {
        code: '51810',
        name: '인제군',
        sigungu: '인제군',
        sido: '강원특별자치도',
        center: {
          lat: 38.069706,
          lng: 128.170351,
        },
      },
      {
        code: '51820',
        name: '고성군',
        sigungu: '고성군',
        sido: '강원특별자치도',
        center: {
          lat: 38.380592,
          lng: 128.467866,
        },
      },
      {
        code: '51830',
        name: '양양군',
        sigungu: '양양군',
        sido: '강원특별자치도',
        center: {
          lat: 38.075511,
          lng: 128.61908,
        },
      },
    ],
  },
  {
    code: '41',
    name: '경기도',
    regions: [
      {
        code: '41111',
        name: '장안구',
        sigungu: '수원시 장안구',
        sido: '경기도',
        center: {
          lat: 37.303922,
          lng: 127.010273,
        },
      },
      {
        code: '41113',
        name: '권선구',
        sigungu: '수원시 권선구',
        sido: '경기도',
        center: {
          lat: 37.257631,
          lng: 126.971873,
        },
      },
      {
        code: '41115',
        name: '팔달구',
        sigungu: '수원시 팔달구',
        sido: '경기도',
        center: {
          lat: 37.282559,
          lng: 127.020122,
        },
      },
      {
        code: '41117',
        name: '영통구',
        sigungu: '수원시 영통구',
        sido: '경기도',
        center: {
          lat: 37.259604,
          lng: 127.046625,
        },
      },
      {
        code: '41131',
        name: '수정구',
        sigungu: '성남시 수정구',
        sido: '경기도',
        center: {
          lat: 37.45039,
          lng: 127.145617,
        },
      },
      {
        code: '41133',
        name: '중원구',
        sigungu: '성남시 중원구',
        sido: '경기도',
        center: {
          lat: 37.430599,
          lng: 127.137232,
        },
      },
      {
        code: '41135',
        name: '분당구',
        sigungu: '성남시 분당구',
        sido: '경기도',
        center: {
          lat: 37.382746,
          lng: 127.11883,
        },
      },
      {
        code: '41150',
        name: '의정부시',
        sigungu: '의정부시',
        sido: '경기도',
        center: {
          lat: 37.738057,
          lng: 127.033899,
        },
      },
      {
        code: '41171',
        name: '만안구',
        sigungu: '안양시 만안구',
        sido: '경기도',
        center: {
          lat: 37.386704,
          lng: 126.93251,
        },
      },
      {
        code: '41173',
        name: '동안구',
        sigungu: '안양시 동안구',
        sido: '경기도',
        center: {
          lat: 37.392606,
          lng: 126.951423,
        },
      },
      {
        code: '41192',
        name: '원미구',
        sigungu: '부천시 원미구',
        sido: '경기도',
        center: {
          lat: 37.496596,
          lng: 126.787017,
        },
      },
      {
        code: '41194',
        name: '소사구',
        sigungu: '부천시 소사구',
        sido: '경기도',
        center: {
          lat: 37.480058,
          lng: 126.799953,
        },
      },
      {
        code: '41196',
        name: '오정구',
        sigungu: '부천시 오정구',
        sido: '경기도',
        center: {
          lat: 37.52838,
          lng: 126.795755,
        },
      },
      {
        code: '41210',
        name: '광명시',
        sigungu: '광명시',
        sido: '경기도',
        center: {
          lat: 37.478567,
          lng: 126.864648,
        },
      },
      {
        code: '41220',
        name: '평택시',
        sigungu: '평택시',
        sido: '경기도',
        center: {
          lat: 36.992261,
          lng: 127.112688,
        },
      },
      {
        code: '41250',
        name: '동두천시',
        sigungu: '동두천시',
        sido: '경기도',
        center: {
          lat: 37.903599,
          lng: 127.060441,
        },
      },
      {
        code: '41271',
        name: '상록구',
        sigungu: '안산시 상록구',
        sido: '경기도',
        center: {
          lat: 37.300972,
          lng: 126.846483,
        },
      },
      {
        code: '41273',
        name: '단원구',
        sigungu: '안산시 단원구',
        sido: '경기도',
        center: {
          lat: 37.321147,
          lng: 126.815326,
        },
      },
      {
        code: '41281',
        name: '덕양구',
        sigungu: '고양시 덕양구',
        sido: '경기도',
        center: {
          lat: 37.63748,
          lng: 126.832188,
        },
      },
      {
        code: '41285',
        name: '일산동구',
        sigungu: '고양시 일산동구',
        sido: '경기도',
        center: {
          lat: 37.658875,
          lng: 126.775008,
        },
      },
      {
        code: '41287',
        name: '일산서구',
        sigungu: '고양시 일산서구',
        sido: '경기도',
        center: {
          lat: 37.677951,
          lng: 126.745477,
        },
      },
      {
        code: '41290',
        name: '과천시',
        sigungu: '과천시',
        sido: '경기도',
        center: {
          lat: 37.429233,
          lng: 126.987721,
        },
      },
      {
        code: '41310',
        name: '구리시',
        sigungu: '구리시',
        sido: '경기도',
        center: {
          lat: 37.594352,
          lng: 127.129642,
        },
      },
      {
        code: '41360',
        name: '남양주시',
        sigungu: '남양주시',
        sido: '경기도',
        center: {
          lat: 37.636024,
          lng: 127.216476,
        },
      },
      {
        code: '41370',
        name: '오산시',
        sigungu: '오산시',
        sido: '경기도',
        center: {
          lat: 37.149879,
          lng: 127.077527,
        },
      },
      {
        code: '41390',
        name: '시흥시',
        sigungu: '시흥시',
        sido: '경기도',
        center: {
          lat: 37.380115,
          lng: 126.802978,
        },
      },
      {
        code: '41410',
        name: '군포시',
        sigungu: '군포시',
        sido: '경기도',
        center: {
          lat: 37.361632,
          lng: 126.935206,
        },
      },
      {
        code: '41430',
        name: '의왕시',
        sigungu: '의왕시',
        sido: '경기도',
        center: {
          lat: 37.34476,
          lng: 126.968274,
        },
      },
      {
        code: '41450',
        name: '하남시',
        sigungu: '하남시',
        sido: '경기도',
        center: {
          lat: 37.539275,
          lng: 127.214861,
        },
      },
      {
        code: '41461',
        name: '처인구',
        sigungu: '용인시 처인구',
        sido: '경기도',
        center: {
          lat: 37.234306,
          lng: 127.201357,
        },
      },
      {
        code: '41463',
        name: '기흥구',
        sigungu: '용인시 기흥구',
        sido: '경기도',
        center: {
          lat: 37.280411,
          lng: 127.114713,
        },
      },
      {
        code: '41465',
        name: '수지구',
        sigungu: '용인시 수지구',
        sido: '경기도',
        center: {
          lat: 37.322115,
          lng: 127.097682,
        },
      },
      {
        code: '41480',
        name: '파주시',
        sigungu: '파주시',
        sido: '경기도',
        center: {
          lat: 37.760045,
          lng: 126.779881,
        },
      },
      {
        code: '41500',
        name: '이천시',
        sigungu: '이천시',
        sido: '경기도',
        center: {
          lat: 37.272268,
          lng: 127.435089,
        },
      },
      {
        code: '41550',
        name: '안성시',
        sigungu: '안성시',
        sido: '경기도',
        center: {
          lat: 37.008071,
          lng: 127.27979,
        },
      },
      {
        code: '41570',
        name: '김포시',
        sigungu: '김포시',
        sido: '경기도',
        center: {
          lat: 37.615269,
          lng: 126.715658,
        },
      },
      {
        code: '41591',
        name: '만세구',
        sigungu: '화성시 만세구',
        sido: '경기도',
        center: {
          lat: 37.13771,
          lng: 126.925673,
        },
      },
      {
        code: '41593',
        name: '효행구',
        sigungu: '화성시 효행구',
        sido: '경기도',
        center: {
          lat: 37.20918,
          lng: 126.959183,
        },
      },
      {
        code: '41595',
        name: '병점구',
        sigungu: '화성시 병점구',
        sido: '경기도',
        center: {
          lat: 37.208749,
          lng: 127.03609,
        },
      },
      {
        code: '41597',
        name: '동탄구',
        sigungu: '화성시 동탄구',
        sido: '경기도',
        center: {
          lat: 37.197278,
          lng: 127.097007,
        },
      },
      {
        code: '41610',
        name: '광주시',
        sigungu: '광주시',
        sido: '경기도',
        center: {
          lat: 37.429394,
          lng: 127.255139,
        },
      },
      {
        code: '41630',
        name: '양주시',
        sigungu: '양주시',
        sido: '경기도',
        center: {
          lat: 37.785314,
          lng: 127.045786,
        },
      },
      {
        code: '41650',
        name: '포천시',
        sigungu: '포천시',
        sido: '경기도',
        center: {
          lat: 37.894993,
          lng: 127.200333,
        },
      },
      {
        code: '41670',
        name: '여주시',
        sigungu: '여주시',
        sido: '경기도',
        center: {
          lat: 37.298423,
          lng: 127.637059,
        },
      },
      {
        code: '41800',
        name: '연천군',
        sigungu: '연천군',
        sido: '경기도',
        center: {
          lat: 38.096522,
          lng: 127.075356,
        },
      },
      {
        code: '41820',
        name: '가평군',
        sigungu: '가평군',
        sido: '경기도',
        center: {
          lat: 37.831441,
          lng: 127.50957,
        },
      },
      {
        code: '41830',
        name: '양평군',
        sigungu: '양평군',
        sido: '경기도',
        center: {
          lat: 37.491788,
          lng: 127.487578,
        },
      },
    ],
  },
  {
    code: '48',
    name: '경상남도',
    regions: [
      {
        code: '48121',
        name: '의창구',
        sigungu: '창원시 의창구',
        sido: '경상남도',
        center: {
          lat: 35.255645,
          lng: 128.634885,
        },
      },
      {
        code: '48123',
        name: '성산구',
        sigungu: '창원시 성산구',
        sido: '경상남도',
        center: {
          lat: 35.198411,
          lng: 128.702788,
        },
      },
      {
        code: '48125',
        name: '마산합포구',
        sigungu: '창원시 마산합포구',
        sido: '경상남도',
        center: {
          lat: 35.196964,
          lng: 128.567859,
        },
      },
      {
        code: '48127',
        name: '마산회원구',
        sigungu: '창원시 마산회원구',
        sido: '경상남도',
        center: {
          lat: 35.220852,
          lng: 128.579714,
        },
      },
      {
        code: '48129',
        name: '진해구',
        sigungu: '창원시 진해구',
        sido: '경상남도',
        center: {
          lat: 35.13343,
          lng: 128.710188,
        },
      },
      {
        code: '48170',
        name: '진주시',
        sigungu: '진주시',
        sido: '경상남도',
        center: {
          lat: 35.180223,
          lng: 128.107706,
        },
      },
      {
        code: '48220',
        name: '통영시',
        sigungu: '통영시',
        sido: '경상남도',
        center: {
          lat: 34.854445,
          lng: 128.433149,
        },
      },
      {
        code: '48240',
        name: '사천시',
        sigungu: '사천시',
        sido: '경상남도',
        center: {
          lat: 35.003677,
          lng: 128.064213,
        },
      },
      {
        code: '48250',
        name: '김해시',
        sigungu: '김해시',
        sido: '경상남도',
        center: {
          lat: 35.228565,
          lng: 128.889363,
        },
      },
      {
        code: '48270',
        name: '밀양시',
        sigungu: '밀양시',
        sido: '경상남도',
        center: {
          lat: 35.503817,
          lng: 128.746608,
        },
      },
      {
        code: '48310',
        name: '거제시',
        sigungu: '거제시',
        sido: '경상남도',
        center: {
          lat: 34.880539,
          lng: 128.621129,
        },
      },
      {
        code: '48330',
        name: '양산시',
        sigungu: '양산시',
        sido: '경상남도',
        center: {
          lat: 35.334992,
          lng: 129.037273,
        },
      },
      {
        code: '48720',
        name: '의령군',
        sigungu: '의령군',
        sido: '경상남도',
        center: {
          lat: 35.322235,
          lng: 128.261686,
        },
      },
      {
        code: '48730',
        name: '함안군',
        sigungu: '함안군',
        sido: '경상남도',
        center: {
          lat: 35.272428,
          lng: 128.406499,
        },
      },
      {
        code: '48740',
        name: '창녕군',
        sigungu: '창녕군',
        sido: '경상남도',
        center: {
          lat: 35.544615,
          lng: 128.492168,
        },
      },
      {
        code: '48820',
        name: '고성군',
        sigungu: '고성군',
        sido: '경상남도',
        center: {
          lat: 34.973062,
          lng: 128.322361,
        },
      },
      {
        code: '48840',
        name: '남해군',
        sigungu: '남해군',
        sido: '경상남도',
        center: {
          lat: 34.837703,
          lng: 127.892653,
        },
      },
      {
        code: '48850',
        name: '하동군',
        sigungu: '하동군',
        sido: '경상남도',
        center: {
          lat: 35.067306,
          lng: 127.751308,
        },
      },
      {
        code: '48860',
        name: '산청군',
        sigungu: '산청군',
        sido: '경상남도',
        center: {
          lat: 35.41553,
          lng: 127.87335,
        },
      },
      {
        code: '48870',
        name: '함양군',
        sigungu: '함양군',
        sido: '경상남도',
        center: {
          lat: 35.520527,
          lng: 127.72516,
        },
      },
      {
        code: '48880',
        name: '거창군',
        sigungu: '거창군',
        sido: '경상남도',
        center: {
          lat: 35.686685,
          lng: 127.909503,
        },
      },
      {
        code: '48890',
        name: '합천군',
        sigungu: '합천군',
        sido: '경상남도',
        center: {
          lat: 35.56667,
          lng: 128.165791,
        },
      },
    ],
  },
  {
    code: '47',
    name: '경상북도',
    regions: [
      {
        code: '47111',
        name: '남구',
        sigungu: '포항시 남구',
        sido: '경상북도',
        center: {
          lat: 36.008376,
          lng: 129.35979,
        },
      },
      {
        code: '47113',
        name: '북구',
        sigungu: '포항시 북구',
        sido: '경상북도',
        center: {
          lat: 36.043742,
          lng: 129.368576,
        },
      },
      {
        code: '47130',
        name: '경주시',
        sigungu: '경주시',
        sido: '경상북도',
        center: {
          lat: 35.856218,
          lng: 129.224782,
        },
      },
      {
        code: '47150',
        name: '김천시',
        sigungu: '김천시',
        sido: '경상북도',
        center: {
          lat: 36.139888,
          lng: 128.113624,
        },
      },
      {
        code: '47170',
        name: '안동시',
        sigungu: '안동시',
        sido: '경상북도',
        center: {
          lat: 36.568461,
          lng: 128.729587,
        },
      },
      {
        code: '47190',
        name: '구미시',
        sigungu: '구미시',
        sido: '경상북도',
        center: {
          lat: 36.119571,
          lng: 128.344246,
        },
      },
      {
        code: '47210',
        name: '영주시',
        sigungu: '영주시',
        sido: '경상북도',
        center: {
          lat: 36.805619,
          lng: 128.623937,
        },
      },
      {
        code: '47230',
        name: '영천시',
        sigungu: '영천시',
        sido: '경상북도',
        center: {
          lat: 35.973221,
          lng: 128.938551,
        },
      },
      {
        code: '47250',
        name: '상주시',
        sigungu: '상주시',
        sido: '경상북도',
        center: {
          lat: 36.41094,
          lng: 128.159145,
        },
      },
      {
        code: '47280',
        name: '문경시',
        sigungu: '문경시',
        sido: '경상북도',
        center: {
          lat: 36.586527,
          lng: 128.186772,
        },
      },
      {
        code: '47290',
        name: '경산시',
        sigungu: '경산시',
        sido: '경상북도',
        center: {
          lat: 35.825082,
          lng: 128.741317,
        },
      },
      {
        code: '47730',
        name: '의성군',
        sigungu: '의성군',
        sido: '경상북도',
        center: {
          lat: 36.352716,
          lng: 128.697078,
        },
      },
      {
        code: '47750',
        name: '청송군',
        sigungu: '청송군',
        sido: '경상북도',
        center: {
          lat: 36.43623,
          lng: 129.057071,
        },
      },
      {
        code: '47760',
        name: '영양군',
        sigungu: '영양군',
        sido: '경상북도',
        center: {
          lat: 36.666703,
          lng: 129.11251,
        },
      },
      {
        code: '47770',
        name: '영덕군',
        sigungu: '영덕군',
        sido: '경상북도',
        center: {
          lat: 36.415062,
          lng: 129.365307,
        },
      },
      {
        code: '47820',
        name: '청도군',
        sigungu: '청도군',
        sido: '경상북도',
        center: {
          lat: 35.647385,
          lng: 128.734015,
        },
      },
      {
        code: '47830',
        name: '고령군',
        sigungu: '고령군',
        sido: '경상북도',
        center: {
          lat: 35.726065,
          lng: 128.262896,
        },
      },
      {
        code: '47840',
        name: '성주군',
        sigungu: '성주군',
        sido: '경상북도',
        center: {
          lat: 35.919093,
          lng: 128.282935,
        },
      },
      {
        code: '47850',
        name: '칠곡군',
        sigungu: '칠곡군',
        sido: '경상북도',
        center: {
          lat: 35.99559,
          lng: 128.401662,
        },
      },
      {
        code: '47900',
        name: '예천군',
        sigungu: '예천군',
        sido: '경상북도',
        center: {
          lat: 36.646936,
          lng: 128.43736,
        },
      },
      {
        code: '47920',
        name: '봉화군',
        sigungu: '봉화군',
        sido: '경상북도',
        center: {
          lat: 36.893135,
          lng: 128.732387,
        },
      },
      {
        code: '47930',
        name: '울진군',
        sigungu: '울진군',
        sido: '경상북도',
        center: {
          lat: 36.993035,
          lng: 129.400547,
        },
      },
      {
        code: '47940',
        name: '울릉군',
        sigungu: '울릉군',
        sido: '경상북도',
        center: {
          lat: 37.484442,
          lng: 130.905713,
        },
      },
    ],
  },
  {
    code: '27',
    name: '대구광역시',
    regions: [
      {
        code: '27110',
        name: '중구',
        sigungu: '중구',
        sido: '대구광역시',
        center: {
          lat: 35.869389,
          lng: 128.606221,
        },
      },
      {
        code: '27140',
        name: '동구',
        sigungu: '동구',
        sido: '대구광역시',
        center: {
          lat: 35.886624,
          lng: 128.635524,
        },
      },
      {
        code: '27170',
        name: '서구',
        sigungu: '서구',
        sido: '대구광역시',
        center: {
          lat: 35.871668,
          lng: 128.559154,
        },
      },
      {
        code: '27200',
        name: '남구',
        sigungu: '남구',
        sido: '대구광역시',
        center: {
          lat: 35.846041,
          lng: 128.597679,
        },
      },
      {
        code: '27230',
        name: '북구',
        sigungu: '북구',
        sido: '대구광역시',
        center: {
          lat: 35.885683,
          lng: 128.582781,
        },
      },
      {
        code: '27260',
        name: '수성구',
        sigungu: '수성구',
        sido: '대구광역시',
        center: {
          lat: 35.858175,
          lng: 128.630635,
        },
      },
      {
        code: '27290',
        name: '달서구',
        sigungu: '달서구',
        sido: '대구광역시',
        center: {
          lat: 35.829915,
          lng: 128.532837,
        },
      },
      {
        code: '27710',
        name: '달성군',
        sigungu: '달성군',
        sido: '대구광역시',
        center: {
          lat: 35.774474,
          lng: 128.43122,
        },
      },
      {
        code: '27720',
        name: '군위군',
        sigungu: '군위군',
        sido: '대구광역시',
        center: {
          lat: 36.242965,
          lng: 128.572963,
        },
      },
    ],
  },
  {
    code: '30',
    name: '대전광역시',
    regions: [
      {
        code: '30110',
        name: '동구',
        sigungu: '동구',
        sido: '대전광역시',
        center: {
          lat: 36.311777,
          lng: 127.454807,
        },
      },
      {
        code: '30140',
        name: '중구',
        sigungu: '중구',
        sido: '대전광역시',
        center: {
          lat: 36.325781,
          lng: 127.42134,
        },
      },
      {
        code: '30170',
        name: '서구',
        sigungu: '서구',
        sido: '대전광역시',
        center: {
          lat: 36.355499,
          lng: 127.38379,
        },
      },
      {
        code: '30200',
        name: '유성구',
        sigungu: '유성구',
        sido: '대전광역시',
        center: {
          lat: 36.362285,
          lng: 127.356258,
        },
      },
      {
        code: '30230',
        name: '대덕구',
        sigungu: '대덕구',
        sido: '대전광역시',
        center: {
          lat: 36.346705,
          lng: 127.415562,
        },
      },
    ],
  },
  {
    code: '26',
    name: '부산광역시',
    regions: [
      {
        code: '26110',
        name: '중구',
        sigungu: '중구',
        sido: '부산광역시',
        center: {
          lat: 35.106227,
          lng: 129.032373,
        },
      },
      {
        code: '26140',
        name: '서구',
        sigungu: '서구',
        sido: '부산광역시',
        center: {
          lat: 35.097924,
          lng: 129.024298,
        },
      },
      {
        code: '26170',
        name: '동구',
        sigungu: '동구',
        sido: '부산광역시',
        center: {
          lat: 35.129267,
          lng: 129.045306,
        },
      },
      {
        code: '26200',
        name: '영도구',
        sigungu: '영도구',
        sido: '부산광역시',
        center: {
          lat: 35.09124,
          lng: 129.067889,
        },
      },
      {
        code: '26230',
        name: '부산진구',
        sigungu: '부산진구',
        sido: '부산광역시',
        center: {
          lat: 35.162855,
          lng: 129.053165,
        },
      },
      {
        code: '26260',
        name: '동래구',
        sigungu: '동래구',
        sido: '부산광역시',
        center: {
          lat: 35.205092,
          lng: 129.083719,
        },
      },
      {
        code: '26290',
        name: '남구',
        sigungu: '남구',
        sido: '부산광역시',
        center: {
          lat: 35.136523,
          lng: 129.084238,
        },
      },
      {
        code: '26320',
        name: '북구',
        sigungu: '북구',
        sido: '부산광역시',
        center: {
          lat: 35.197296,
          lng: 128.990037,
        },
      },
      {
        code: '26350',
        name: '해운대구',
        sigungu: '해운대구',
        sido: '부산광역시',
        center: {
          lat: 35.163067,
          lng: 129.163596,
        },
      },
      {
        code: '26380',
        name: '사하구',
        sigungu: '사하구',
        sido: '부산광역시',
        center: {
          lat: 35.104448,
          lng: 128.974933,
        },
      },
      {
        code: '26410',
        name: '금정구',
        sigungu: '금정구',
        sido: '부산광역시',
        center: {
          lat: 35.242777,
          lng: 129.092095,
        },
      },
      {
        code: '26440',
        name: '강서구',
        sigungu: '강서구',
        sido: '부산광역시',
        center: {
          lat: 35.212194,
          lng: 128.980562,
        },
      },
      {
        code: '26470',
        name: '연제구',
        sigungu: '연제구',
        sido: '부산광역시',
        center: {
          lat: 35.176208,
          lng: 129.079741,
        },
      },
      {
        code: '26500',
        name: '수영구',
        sigungu: '수영구',
        sido: '부산광역시',
        center: {
          lat: 35.145538,
          lng: 129.113125,
        },
      },
      {
        code: '26530',
        name: '사상구',
        sigungu: '사상구',
        sido: '부산광역시',
        center: {
          lat: 35.152598,
          lng: 128.99112,
        },
      },
      {
        code: '26710',
        name: '기장군',
        sigungu: '기장군',
        sido: '부산광역시',
        center: {
          lat: 35.244418,
          lng: 129.222422,
        },
      },
    ],
  },
  {
    code: '11',
    name: '서울특별시',
    regions: [
      {
        code: '11110',
        name: '종로구',
        sigungu: '종로구',
        sido: '서울특별시',
        center: {
          lat: 37.574773,
          lng: 126.979614,
        },
      },
      {
        code: '11140',
        name: '중구',
        sigungu: '중구',
        sido: '서울특별시',
        center: {
          lat: 37.563808,
          lng: 126.997555,
        },
      },
      {
        code: '11170',
        name: '용산구',
        sigungu: '용산구',
        sido: '서울특별시',
        center: {
          lat: 37.532427,
          lng: 126.990578,
        },
      },
      {
        code: '11200',
        name: '성동구',
        sigungu: '성동구',
        sido: '서울특별시',
        center: {
          lat: 37.563427,
          lng: 127.03693,
        },
      },
      {
        code: '11215',
        name: '광진구',
        sigungu: '광진구',
        sido: '서울특별시',
        center: {
          lat: 37.536284,
          lng: 127.087755,
        },
      },
      {
        code: '11230',
        name: '동대문구',
        sigungu: '동대문구',
        sido: '서울특별시',
        center: {
          lat: 37.574418,
          lng: 127.039748,
        },
      },
      {
        code: '11260',
        name: '중랑구',
        sigungu: '중랑구',
        sido: '서울특별시',
        center: {
          lat: 37.606543,
          lng: 127.09282,
        },
      },
      {
        code: '11290',
        name: '성북구',
        sigungu: '성북구',
        sido: '서울특별시',
        center: {
          lat: 37.589359,
          lng: 127.016703,
        },
      },
      {
        code: '11305',
        name: '강북구',
        sigungu: '강북구',
        sido: '서울특별시',
        center: {
          lat: 37.637128,
          lng: 127.024205,
        },
      },
      {
        code: '11320',
        name: '도봉구',
        sigungu: '도봉구',
        sido: '서울특별시',
        center: {
          lat: 37.668691,
          lng: 127.04721,
        },
      },
      {
        code: '11350',
        name: '노원구',
        sigungu: '노원구',
        sido: '서울특별시',
        center: {
          lat: 37.654362,
          lng: 127.05643,
        },
      },
      {
        code: '11380',
        name: '은평구',
        sigungu: '은평구',
        sido: '서울특별시',
        center: {
          lat: 37.602817,
          lng: 126.928941,
        },
      },
      {
        code: '11410',
        name: '서대문구',
        sigungu: '서대문구',
        sido: '서울특별시',
        center: {
          lat: 37.579162,
          lng: 126.936816,
        },
      },
      {
        code: '11440',
        name: '마포구',
        sigungu: '마포구',
        sido: '서울특별시',
        center: {
          lat: 37.566214,
          lng: 126.901955,
        },
      },
      {
        code: '11470',
        name: '양천구',
        sigungu: '양천구',
        sido: '서울특별시',
        center: {
          lat: 37.516988,
          lng: 126.866501,
        },
      },
      {
        code: '11500',
        name: '강서구',
        sigungu: '강서구',
        sido: '서울특별시',
        center: {
          lat: 37.561437,
          lng: 126.823186,
        },
      },
      {
        code: '11530',
        name: '구로구',
        sigungu: '구로구',
        sido: '서울특별시',
        center: {
          lat: 37.495433,
          lng: 126.887505,
        },
      },
      {
        code: '11545',
        name: '금천구',
        sigungu: '금천구',
        sido: '서울특별시',
        center: {
          lat: 37.456841,
          lng: 126.895457,
        },
      },
      {
        code: '11560',
        name: '영등포구',
        sigungu: '영등포구',
        sido: '서울특별시',
        center: {
          lat: 37.526364,
          lng: 126.896274,
        },
      },
      {
        code: '11590',
        name: '동작구',
        sigungu: '동작구',
        sido: '서울특별시',
        center: {
          lat: 37.504237,
          lng: 126.940272,
        },
      },
      {
        code: '11620',
        name: '관악구',
        sigungu: '관악구',
        sido: '서울특별시',
        center: {
          lat: 37.478257,
          lng: 126.951521,
        },
      },
      {
        code: '11650',
        name: '서초구',
        sigungu: '서초구',
        sido: '서울특별시',
        center: {
          lat: 37.483589,
          lng: 127.032735,
        },
      },
      {
        code: '11680',
        name: '강남구',
        sigungu: '강남구',
        sido: '서울특별시',
        center: {
          lat: 37.517332,
          lng: 127.047377,
        },
      },
      {
        code: '11710',
        name: '송파구',
        sigungu: '송파구',
        sido: '서울특별시',
        center: {
          lat: 37.514584,
          lng: 127.105918,
        },
      },
      {
        code: '11740',
        name: '강동구',
        sigungu: '강동구',
        sido: '서울특별시',
        center: {
          lat: 37.530193,
          lng: 127.123793,
        },
      },
    ],
  },
  {
    code: '36',
    name: '세종특별자치시',
    regions: [
      {
        code: '36110',
        name: '세종특별자치시',
        sigungu: '세종특별자치시',
        sido: '세종특별자치시',
        center: {
          lat: 36.480065,
          lng: 127.289195,
        },
      },
    ],
  },
  {
    code: '31',
    name: '울산광역시',
    regions: [
      {
        code: '31110',
        name: '중구',
        sigungu: '중구',
        sido: '울산광역시',
        center: {
          lat: 35.569335,
          lng: 129.332494,
        },
      },
      {
        code: '31140',
        name: '남구',
        sigungu: '남구',
        sido: '울산광역시',
        center: {
          lat: 35.54381,
          lng: 129.330092,
        },
      },
      {
        code: '31170',
        name: '동구',
        sigungu: '동구',
        sido: '울산광역시',
        center: {
          lat: 35.504636,
          lng: 129.416488,
        },
      },
      {
        code: '31200',
        name: '북구',
        sigungu: '북구',
        sido: '울산광역시',
        center: {
          lat: 35.582747,
          lng: 129.361147,
        },
      },
      {
        code: '31710',
        name: '울주군',
        sigungu: '울주군',
        sido: '울산광역시',
        center: {
          lat: 35.522025,
          lng: 129.242115,
        },
      },
    ],
  },
  {
    code: '28',
    name: '인천광역시',
    regions: [
      {
        code: '28125',
        name: '제물포구',
        sigungu: '제물포구',
        sido: '인천광역시',
        center: {
          lat: 37.473861,
          lng: 126.643282,
        },
      },
      {
        code: '28155',
        name: '영종구',
        sigungu: '영종구',
        sido: '인천광역시',
        center: {
          lat: 37.489769,
          lng: 126.559939,
        },
      },
      {
        code: '28177',
        name: '미추홀구',
        sigungu: '미추홀구',
        sido: '인천광역시',
        center: {
          lat: 37.463586,
          lng: 126.650565,
        },
      },
      {
        code: '28185',
        name: '연수구',
        sigungu: '연수구',
        sido: '인천광역시',
        center: {
          lat: 37.410101,
          lng: 126.678275,
        },
      },
      {
        code: '28200',
        name: '남동구',
        sigungu: '남동구',
        sido: '인천광역시',
        center: {
          lat: 37.447349,
          lng: 126.731488,
        },
      },
      {
        code: '28237',
        name: '부평구',
        sigungu: '부평구',
        sido: '인천광역시',
        center: {
          lat: 37.507042,
          lng: 126.721864,
        },
      },
      {
        code: '28245',
        name: '계양구',
        sigungu: '계양구',
        sido: '인천광역시',
        center: {
          lat: 37.537496,
          lng: 126.737705,
        },
      },
      {
        code: '28275',
        name: '서해구',
        sigungu: '서해구',
        sido: '인천광역시',
        center: {
          lat: 37.545434,
          lng: 126.676028,
        },
      },
      {
        code: '28290',
        name: '검단구',
        sigungu: '검단구',
        sido: '인천광역시',
        center: {
          lat: 37.591536,
          lng: 126.681572,
        },
      },
      {
        code: '28710',
        name: '강화군',
        sigungu: '강화군',
        sido: '인천광역시',
        center: {
          lat: 37.746518,
          lng: 126.488013,
        },
      },
      {
        code: '28720',
        name: '옹진군',
        sigungu: '옹진군',
        sido: '인천광역시',
        center: {
          lat: 37.949028,
          lng: 124.672742,
        },
      },
    ],
  },
  {
    code: '12',
    name: '전남광주통합특별시',
    regions: [
      {
        code: '12110',
        name: '목포시',
        sigungu: '목포시',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.811831,
          lng: 126.392235,
        },
      },
      {
        code: '12130',
        name: '여수시',
        sigungu: '여수시',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.760401,
          lng: 127.662331,
        },
      },
      {
        code: '12150',
        name: '순천시',
        sigungu: '순천시',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.95061,
          lng: 127.487383,
        },
      },
      {
        code: '12170',
        name: '나주시',
        sigungu: '나주시',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.015898,
          lng: 126.710829,
        },
      },
      {
        code: '12190',
        name: '광양시',
        sigungu: '광양시',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.940425,
          lng: 127.695931,
        },
      },
      {
        code: '12210',
        name: '동구',
        sigungu: '동구',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.146167,
          lng: 126.923095,
        },
      },
      {
        code: '12240',
        name: '서구',
        sigungu: '서구',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.152072,
          lng: 126.890188,
        },
      },
      {
        code: '12270',
        name: '남구',
        sigungu: '남구',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.132819,
          lng: 126.902476,
        },
      },
      {
        code: '12300',
        name: '북구',
        sigungu: '북구',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.174173,
          lng: 126.912012,
        },
      },
      {
        code: '12330',
        name: '광산구',
        sigungu: '광산구',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.139547,
          lng: 126.793633,
        },
      },
      {
        code: '12710',
        name: '담양군',
        sigungu: '담양군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.321211,
          lng: 126.988211,
        },
      },
      {
        code: '12720',
        name: '곡성군',
        sigungu: '곡성군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.282026,
          lng: 127.29193,
        },
      },
      {
        code: '12730',
        name: '구례군',
        sigungu: '구례군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.202496,
          lng: 127.462704,
        },
      },
      {
        code: '12740',
        name: '고흥군',
        sigungu: '고흥군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.604563,
          lng: 127.275462,
        },
      },
      {
        code: '12750',
        name: '보성군',
        sigungu: '보성군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.771443,
          lng: 127.079946,
        },
      },
      {
        code: '12760',
        name: '화순군',
        sigungu: '화순군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.064512,
          lng: 126.986502,
        },
      },
      {
        code: '12770',
        name: '장흥군',
        sigungu: '장흥군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.681612,
          lng: 126.907058,
        },
      },
      {
        code: '12780',
        name: '강진군',
        sigungu: '강진군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.642062,
          lng: 126.767213,
        },
      },
      {
        code: '12790',
        name: '해남군',
        sigungu: '해남군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.573907,
          lng: 126.599643,
        },
      },
      {
        code: '12800',
        name: '영암군',
        sigungu: '영암군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.800059,
          lng: 126.696763,
        },
      },
      {
        code: '12810',
        name: '무안군',
        sigungu: '무안군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.990341,
          lng: 126.481705,
        },
      },
      {
        code: '12820',
        name: '함평군',
        sigungu: '함평군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.065911,
          lng: 126.516625,
        },
      },
      {
        code: '12830',
        name: '영광군',
        sigungu: '영광군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.27719,
          lng: 126.512014,
        },
      },
      {
        code: '12840',
        name: '장성군',
        sigungu: '장성군',
        sido: '전남광주통합특별시',
        center: {
          lat: 35.301858,
          lng: 126.784919,
        },
      },
      {
        code: '12850',
        name: '완도군',
        sigungu: '완도군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.310979,
          lng: 126.754999,
        },
      },
      {
        code: '12860',
        name: '진도군',
        sigungu: '진도군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.486829,
          lng: 126.263446,
        },
      },
      {
        code: '12870',
        name: '신안군',
        sigungu: '신안군',
        sido: '전남광주통합특별시',
        center: {
          lat: 34.833554,
          lng: 126.351614,
        },
      },
    ],
  },
  {
    code: '52',
    name: '전북특별자치도',
    regions: [
      {
        code: '52111',
        name: '완산구',
        sigungu: '전주시 완산구',
        sido: '전북특별자치도',
        center: {
          lat: 35.812237,
          lng: 127.119796,
        },
      },
      {
        code: '52113',
        name: '덕진구',
        sigungu: '전주시 덕진구',
        sido: '전북특별자치도',
        center: {
          lat: 35.829403,
          lng: 127.134289,
        },
      },
      {
        code: '52130',
        name: '군산시',
        sigungu: '군산시',
        sido: '전북특별자치도',
        center: {
          lat: 35.967467,
          lng: 126.73684,
        },
      },
      {
        code: '52140',
        name: '익산시',
        sigungu: '익산시',
        sido: '전북특별자치도',
        center: {
          lat: 35.948721,
          lng: 126.957855,
        },
      },
      {
        code: '52180',
        name: '정읍시',
        sigungu: '정읍시',
        sido: '전북특별자치도',
        center: {
          lat: 35.569849,
          lng: 126.855997,
        },
      },
      {
        code: '52190',
        name: '남원시',
        sigungu: '남원시',
        sido: '전북특별자치도',
        center: {
          lat: 35.416363,
          lng: 127.390396,
        },
      },
      {
        code: '52210',
        name: '김제시',
        sigungu: '김제시',
        sido: '전북특별자치도',
        center: {
          lat: 35.803582,
          lng: 126.880646,
        },
      },
      {
        code: '52710',
        name: '완주군',
        sigungu: '완주군',
        sido: '전북특별자치도',
        center: {
          lat: 35.904815,
          lng: 127.162119,
        },
      },
      {
        code: '52720',
        name: '진안군',
        sigungu: '진안군',
        sido: '전북특별자치도',
        center: {
          lat: 35.791772,
          lng: 127.424865,
        },
      },
      {
        code: '52730',
        name: '무주군',
        sigungu: '무주군',
        sido: '전북특별자치도',
        center: {
          lat: 36.006844,
          lng: 127.660806,
        },
      },
      {
        code: '52740',
        name: '장수군',
        sigungu: '장수군',
        sido: '전북특별자치도',
        center: {
          lat: 35.64784,
          lng: 127.521293,
        },
      },
      {
        code: '52750',
        name: '임실군',
        sigungu: '임실군',
        sido: '전북특별자치도',
        center: {
          lat: 35.617855,
          lng: 127.289087,
        },
      },
      {
        code: '52770',
        name: '순창군',
        sigungu: '순창군',
        sido: '전북특별자치도',
        center: {
          lat: 35.374431,
          lng: 127.137391,
        },
      },
      {
        code: '52790',
        name: '고창군',
        sigungu: '고창군',
        sido: '전북특별자치도',
        center: {
          lat: 35.435698,
          lng: 126.70212,
        },
      },
      {
        code: '52800',
        name: '부안군',
        sigungu: '부안군',
        sido: '전북특별자치도',
        center: {
          lat: 35.731658,
          lng: 126.733011,
        },
      },
    ],
  },
  {
    code: '50',
    name: '제주특별자치도',
    regions: [
      {
        code: '50110',
        name: '제주시',
        sigungu: '제주시',
        sido: '제주특별자치도',
        center: {
          lat: 33.499534,
          lng: 126.531171,
        },
      },
      {
        code: '50130',
        name: '서귀포시',
        sigungu: '서귀포시',
        sido: '제주특별자치도',
        center: {
          lat: 33.254065,
          lng: 126.559563,
        },
      },
    ],
  },
  {
    code: '44',
    name: '충청남도',
    regions: [
      {
        code: '44131',
        name: '동남구',
        sigungu: '천안시 동남구',
        sido: '충청남도',
        center: {
          lat: 36.806754,
          lng: 127.151678,
        },
      },
      {
        code: '44133',
        name: '서북구',
        sigungu: '천안시 서북구',
        sido: '충청남도',
        center: {
          lat: 36.878448,
          lng: 127.154969,
        },
      },
      {
        code: '44150',
        name: '공주시',
        sigungu: '공주시',
        sido: '충청남도',
        center: {
          lat: 36.446555,
          lng: 127.119055,
        },
      },
      {
        code: '44180',
        name: '보령시',
        sigungu: '보령시',
        sido: '충청남도',
        center: {
          lat: 36.333337,
          lng: 126.612759,
        },
      },
      {
        code: '44200',
        name: '아산시',
        sigungu: '아산시',
        sido: '충청남도',
        center: {
          lat: 36.789974,
          lng: 127.00251,
        },
      },
      {
        code: '44210',
        name: '서산시',
        sigungu: '서산시',
        sido: '충청남도',
        center: {
          lat: 36.784876,
          lng: 126.450334,
        },
      },
      {
        code: '44230',
        name: '논산시',
        sigungu: '논산시',
        sido: '충청남도',
        center: {
          lat: 36.187184,
          lng: 127.098735,
        },
      },
      {
        code: '44250',
        name: '계룡시',
        sigungu: '계룡시',
        sido: '충청남도',
        center: {
          lat: 36.274559,
          lng: 127.248543,
        },
      },
      {
        code: '44270',
        name: '당진시',
        sigungu: '당진시',
        sido: '충청남도',
        center: {
          lat: 36.889675,
          lng: 126.645888,
        },
      },
      {
        code: '44710',
        name: '금산군',
        sigungu: '금산군',
        sido: '충청남도',
        center: {
          lat: 36.108863,
          lng: 127.487975,
        },
      },
      {
        code: '44760',
        name: '부여군',
        sigungu: '부여군',
        sido: '충청남도',
        center: {
          lat: 36.275764,
          lng: 126.909773,
        },
      },
      {
        code: '44770',
        name: '서천군',
        sigungu: '서천군',
        sido: '충청남도',
        center: {
          lat: 36.078036,
          lng: 126.702883,
        },
      },
      {
        code: '44790',
        name: '청양군',
        sigungu: '청양군',
        sido: '충청남도',
        center: {
          lat: 36.459215,
          lng: 126.8022,
        },
      },
      {
        code: '44800',
        name: '홍성군',
        sigungu: '홍성군',
        sido: '충청남도',
        center: {
          lat: 36.601358,
          lng: 126.660832,
        },
      },
      {
        code: '44810',
        name: '예산군',
        sigungu: '예산군',
        sido: '충청남도',
        center: {
          lat: 36.680881,
          lng: 126.844851,
        },
      },
      {
        code: '44825',
        name: '태안군',
        sigungu: '태안군',
        sido: '충청남도',
        center: {
          lat: 36.745605,
          lng: 126.297926,
        },
      },
    ],
  },
  {
    code: '43',
    name: '충청북도',
    regions: [
      {
        code: '43111',
        name: '상당구',
        sigungu: '청주시 상당구',
        sido: '충청북도',
        center: {
          lat: 36.589736,
          lng: 127.505109,
        },
      },
      {
        code: '43112',
        name: '서원구',
        sigungu: '청주시 서원구',
        sido: '충청북도',
        center: {
          lat: 36.637652,
          lng: 127.469744,
        },
      },
      {
        code: '43113',
        name: '흥덕구',
        sigungu: '청주시 흥덕구',
        sido: '충청북도',
        center: {
          lat: 36.628927,
          lng: 127.375861,
        },
      },
      {
        code: '43114',
        name: '청원구',
        sigungu: '청주시 청원구',
        sido: '충청북도',
        center: {
          lat: 36.651584,
          lng: 127.486653,
        },
      },
      {
        code: '43130',
        name: '충주시',
        sigungu: '충주시',
        sido: '충청북도',
        center: {
          lat: 36.991049,
          lng: 127.925961,
        },
      },
      {
        code: '43150',
        name: '제천시',
        sigungu: '제천시',
        sido: '충청북도',
        center: {
          lat: 37.132658,
          lng: 128.190985,
        },
      },
      {
        code: '43720',
        name: '보은군',
        sigungu: '보은군',
        sido: '충청북도',
        center: {
          lat: 36.489435,
          lng: 127.729499,
        },
      },
      {
        code: '43730',
        name: '옥천군',
        sigungu: '옥천군',
        sido: '충청북도',
        center: {
          lat: 36.306436,
          lng: 127.571345,
        },
      },
      {
        code: '43740',
        name: '영동군',
        sigungu: '영동군',
        sido: '충청북도',
        center: {
          lat: 36.174993,
          lng: 127.783439,
        },
      },
      {
        code: '43745',
        name: '증평군',
        sigungu: '증평군',
        sido: '충청북도',
        center: {
          lat: 36.785402,
          lng: 127.58154,
        },
      },
      {
        code: '43750',
        name: '진천군',
        sigungu: '진천군',
        sido: '충청북도',
        center: {
          lat: 36.855379,
          lng: 127.435536,
        },
      },
      {
        code: '43760',
        name: '괴산군',
        sigungu: '괴산군',
        sido: '충청북도',
        center: {
          lat: 36.815357,
          lng: 127.786652,
        },
      },
      {
        code: '43770',
        name: '음성군',
        sigungu: '음성군',
        sido: '충청북도',
        center: {
          lat: 36.940322,
          lng: 127.69048,
        },
      },
      {
        code: '43800',
        name: '단양군',
        sigungu: '단양군',
        sido: '충청북도',
        center: {
          lat: 36.984658,
          lng: 128.365546,
        },
      },
    ],
  },
];

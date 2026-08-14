import api from '../index';

interface KeyValue {
  configKey: string;
  configVal: any;
}

export default {
  queryAllConfig: () => api.get('config/queryAll'),
  queryConfig: (data: any) => api.post('config/query', data),
  getPaymentChannelStatus: (): Promise<any> => api.get('config/payment/channel-status') as any,
  setConfig: (data: { settings: KeyValue[] }) => api.post('config/set', data),
  testBaiduConfig: () => api.post('config/testBaiduConfig'),
};

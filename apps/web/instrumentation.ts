export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||!process.env.OTEL_EXPORTER_OTLP_ENDPOINT)return;
 const [{NodeSDK},{OTLPTraceExporter},{getNodeAutoInstrumentations}]=await Promise.all([import('@opentelemetry/sdk-node'),import('@opentelemetry/exporter-trace-otlp-http'),import('@opentelemetry/auto-instrumentations-node')]);
 const sdk=new NodeSDK({traceExporter:new OTLPTraceExporter({url:`${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/,'')}/v1/traces`}),instrumentations:[getNodeAutoInstrumentations()]});
 sdk.start();
}

import { CompiledTravelGraph } from '../graph/travelGraph';
import { CompiledShoppingGraph } from '../graph/shoppingGraph';

declare module 'fastify' {
  interface FastifyInstance {
    travelGraph: CompiledTravelGraph;
    shoppingGraph: CompiledShoppingGraph;
  }
}

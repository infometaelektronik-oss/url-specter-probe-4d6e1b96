import { Route } from '@tanstack/react-router'
import { routeTree } from '../../../routeTree.gen'

export const ApiAiOrganizeMediaRoute = new Route({
  path: '/api/ai/organize-media',
  getParentRoute: () => routeTree.root,
  // loader: async () => {
  //   return {
  //     post: await fetch('https://jsonplaceholder.typicode.com/posts/1').then((r) =>
  //       r.json(),
  //     ),
  //   }
  // },
})

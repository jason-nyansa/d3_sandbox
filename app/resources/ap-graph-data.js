'use strict';

angular.module('resources', [])

.factory('ApGraphData', ['$q', '$http',
  function($q, $http) {
    return {
      load: function() {
        var deferred = $q.defer();

        $http.get('resources/ap-graph-data.json').then(
          function(resp) {
            deferred.resolve(resp.data);
          },
          function() {
            deferred.reject({});
          });

        return deferred.promise;
      },
      trim: function(graph) {
        graph.vertices = _.filter(graph.vertices, function(v) {
          return v.attrs.numDevices > 2;
        });

        var ids = new Set(_.pluck(graph.vertices, 'id'));

        graph.edges = _.filter(graph.edges, function(e) {
          return ids.has(e.source) && ids.has(e.target) && e.attrs.snrDb >= 10.0;
        });

        return graph;
      }
    };
}])

;

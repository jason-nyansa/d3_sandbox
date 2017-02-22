'use strict';

angular.module('resources', [])

.factory('ApGraphData', ['$q', '$http',
  function($q, $http) {
    function _merge(graph, clientHours) {
      var verticesByIds = _.indexBy(graph.vertices, 'id');

      _.each(clientHours, function(symptomDistribs, channel) {
        _.each(symptomDistribs, function(uuidHours, symptom) {
          _.each(uuidHours, function(numHours, apUuid) {
            var v = verticesByIds[apUuid];

            if (v) {
              v.attrs.clientHours = v.attrs.clientHours || [];
              v.attrs.clientHours.push({
                channel: channel,
                symptom: symptom,
                numHours: numHours
              });
            } else {
              console.log("apUuid: " + apUuid + " not found in vertices, skipping");
            }
          });
        });
      });

      return graph;
    }

    return {
      load: function() {
        var deferred = $q.defer();

        $q.all([
            $http.get('resources/ap-graph-data.json'),
            $http.get('resources/client-hours-data.json')
          ])
          .then(function(resps) {
            var graph = resps[0].data,
                clientHours = resps[1].data;

            graph.clientHours = clientHours;
            deferred.resolve(graph);
          })
          .catch(function() {
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

        _.each(graph.clientHours, function(symptomDistribs, channel) {
          _.each(symptomDistribs, function(uuidHours, symptom) {
            _.chain(uuidHours)
              .keys()
              .each(function(apUuid) {
                if (!ids.has(apUuid)) {
                  uuidHours[apUuid] = 0;
                }
              });
          });
        });

        return graph;
      }
    };
}])

;

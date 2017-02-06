'use strict';

angular.module('widgets')

.component('apZooming', {
  restrict: 'E',
  replace: true,
  templateUrl: 'widgets/ap-zooming-tpl.html',
  bindings: {
    data: '<'
  },
  controller: ['$element', ApZoomingController]
});

function ApZoomingController($element) {
  var $ctrl = this;
  var svg, gRoot, packLayout, width, height, rootRadius, treeRoot, zoomedNode;

  var x, y;

  $ctrl.$onInit = function() {
    svg = d3.select($element.find('svg')[0]);

    gRoot = svg.append('g');

    packLayout = d3.layout.pack()
      .value(function(d) {
        return d.attrs.numDevices;
      });

    d3.select(window).on('resize', redraw);
    d3.select(window).on('click', function() { zoom(treeRoot); });
  }

  $ctrl.$onChanges = function() {
    if ($ctrl.data) {
      var graph = JSON.parse(JSON.stringify($ctrl.data));

      var apGroups = _.chain(graph.vertices)
        .filter(function(v) {
          return v.attrs.numDevices > 0;
        })
        .groupBy(function(v) {
          return v.attrs.apGroup;
        })
        .mapObject(function(vs, apGroup) {
          return { name: apGroup, children: vs };
        })
        .values()
        .value();

      treeRoot = {
        name: "Brandeis",
        children: apGroups
      };

      redraw();
    }
  }

  function redraw() {
    var clientRect = svg.node().getBoundingClientRect();
    width = clientRect.width;
    height = clientRect.height;
    rootRadius = _.min([width, height]) * 0.8;

    x = d3.scale.linear().range([0, rootRadius]);
    y = d3.scale.linear().range([0, rootRadius]);

    packLayout.size([rootRadius, rootRadius]);
    var nodes = packLayout.nodes(treeRoot);
    zoomedNode = treeRoot;

    gRoot
      .attr('transform', 'translate(' + (width - rootRadius) / 2 + ',' + (height - rootRadius) / 2 + ')');

    gRoot.selectAll('circle')
        .data(nodes)
      .enter().append('circle')
        .attr('class', function(d) { return d.children ? 'parent' : 'child'; })
        .attr('cx', function(d) { return d.x; })
        .attr('cy', function(d) { return d.y; })
        .attr('r', function(d) { return d.r; })
        .on('click', function(d) { return zoom(d == zoomedNode ? treeRoot : d); });

    gRoot.selectAll('text')
        .data(nodes)
      .enter().append('text')
        .attr('class', function(d) { return d.children ? 'parent' : 'child'; })
        .attr('x', function(d) { return d.x; })
        .attr('y', function(d) { return d.y; })
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .style('opacity', function(d) { return d.r > 20 ? 1 : 0; })
        .text(function(d) { return d.name || d.attrs.apName; });

  }

  function zoom(d, i) {
    var k = rootRadius / d.r / 2;
    x.domain([d.x - d.r, d.x + d.r]);
    y.domain([d.y - d.r, d.y + d.r]);

    var t = gRoot.transition()
      .duration(d3.event.altKey ? 7500 : 750);

    t.selectAll("circle")
      .attr("cx", function(d) { return x(d.x); })
      .attr("cy", function(d) { return y(d.y); })
      .attr("r", function(d) { return k * d.r; });

    t.selectAll("text")
      .attr("x", function(d) { return x(d.x); })
      .attr("y", function(d) { return y(d.y); })
      .style("opacity", function(d) { return k * d.r > 20 ? 1 : 0; });

    zoomedNode = d;
    d3.event.stopPropagation();
  }
}

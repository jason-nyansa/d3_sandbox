'use strict';

angular.module('widgets', [])

.component('apGraph', {
  restrict: 'E',
  replace: true,
  templateUrl: 'widgets/ap-graph-tpl.html',
  bindings: {
    data: '<'
  },
  controller: ['$element', ApGraphController]
})

function ApGraphController($element) {
  var $ctrl = this;
  var svg, width, height, graph, gLinks, gNodes, simulation,
      color = d3.scaleOrdinal(d3.schemeCategory20);

  var radius = d3.scaleSqrt()
    .domain([0, 100])
    .range([1, 20]);

  $ctrl.$onInit = function() {
    svg = d3.select($element.find('svg')[0]);

    gLinks = svg.append('g')
      .attr('class', 'links');
    gNodes = svg.append('g')
      .attr('class', 'nodes');

    simulation = d3.forceSimulation()
      .force('charge', d3.forceManyBody().strength(-10))
      .force('link', d3.forceLink().id(function(d) { return d.id; }))
      .force('center', d3.forceCenter())
      .on('tick', ticked);

    d3.select(window).on('resize', redraw);
  }

  $ctrl.$onChanges = function() {
    if ($ctrl.data) {
      graph = $ctrl.data;

      graph.vertices = _.filter(graph.vertices, function(v) {
        return v.attrs.numDevices > 6;
      });

      var ids = new Set(_.pluck(graph.vertices, 'id'));
      graph.edges = _.filter(graph.edges, function(e) {
        return ids.has(e.source) && ids.has(e.target);
      });

      redraw();
    }
  }

  function redraw() {
    var clientRect = svg.node().getBoundingClientRect();
    width = clientRect.width;
    height = clientRect.height;

    if (!graph) {
      return;
    }

    gLinks.call(links, graph);
    gNodes.call(nodes, graph);

    simulation
      .nodes(graph.vertices)

    simulation.force('link')
      .links(graph.edges);

    simulation.force('center')
      .x(width / 2)
      .y(height / 2);
  }

  function links(g, graph) {
    var gLines = g.selectAll('line').data(graph.edges);

    gLines.exit().remove();

    gLines.enter().append('line');
      // .attr('stroke-width', function(d) { return Math.sqrt(d.attrs.snrDb); });
  }

  function nodes(g, graph) {
    var gCircles = g.selectAll('circle').data(graph.vertices);

    gCircles.exit().remove();

    var gCirclesEnter = gCircles.enter().append('circle');
    gCirclesEnter
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded))
      .append('title')
        .text(function(d) { return d.attrs.apName; });

    gCirclesEnter.merge(gCircles) // new 4.x ENTER + UPDATE pattern
      .attr('r', function(d) { return radius(d.attrs.numDevices); })
      .attr('fill', function(d) { return color(d.attrs.apGroup); });
  }

  function ticked() {
    gLinks.selectAll('line')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });

    gNodes.selectAll('circle')
      .attr('cx', function(d) { return d.x; })  // = Math.max(5, Math.min(width - 5, d.x)); })
      .attr('cy', function(d) { return d.y; }); // = Math.max(5, Math.min(height - 5, d.y)); });
  }

  function dragStarted(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    d.fx = d3.x;
    d.fy = d3.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragEnded(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
  }
}

;

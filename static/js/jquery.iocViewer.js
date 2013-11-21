// jquery.iocViewer.js: replaces IOC XML text elements with styled HTML.
(function ($) {

    // Define the "iocViewer()" plugin function.
    var plugin = function(opts) {
        var defaultOptions = {};

        // Check the options used by this call to the plugin.
        var options = $.extend({}, defaultOptions, opts);

        // Convert each jQuery target to styled HTML elements.
        return this.each(function() {
            var $this=$(this), iocObject, errBase='ioc-parse-error'
                , errLabel='IOC Parse Error:', errMsg;

            // Render the IOC HTML.
            try {
                iocObject = plugin.parse($.trim($this.text()));
                $this.replaceWith(plugin.convertToHtml(iocObject));
            } catch (e) {
                errMsg = e.message.replace(/[\.\s]+$/,'') + '.';
                $this.after(
                    $('<div>').addClass(errBase)
                        .append($('<span>').text(errLabel).addClass(errBase+'-label'))
                        .append($('<span>').text(errMsg).addClass(errBase+'-message'))
                );
            }
        });
    };

    // The OpenIOC v1.0 and v1.1 XML namespaces.
    var ioc_v1_0_XmlNamespace = plugin.OPEN_IOC_V1_0_XML_NAMESPACE =
            'http://schemas.mandiant.com/2010/ioc'
        , ioc_v1_1_XmlNamespace = plugin.OPEN_IOC_V1_1_XML_NAMESPACE =
            'http://openioc.org/schemas/OpenIOC_1.1';

    // Expose the string parsing function.
    plugin.parse = function(xmlstr) {
        var doc; // Load the XML string into a DOM object.
        if (window.DOMParser) {
            doc = new DOMParser().parseFromString(xmlstr, "text/xml");
        } else {
            doc = new ActiveXObject("Microsoft.XMLDOM");
            doc.async = false;
            doc.loadXML(xmlstr);
            if (doc.parseError.errorCode != 0) {
                throw new Error(doc.parseError.reason);
            }
        }
        // Load the XML document, set the source string, and return.
        return this.parseDocument(doc);
    };

    // Expose the document parsing function.
    plugin.parseDocument = function(xmlDoc) {
        // Attempt to fully parse the document.
        var rootNode, attrs, ns, i;
        if (!xmlDoc || !xmlDoc.childNodes || (xmlDoc.childNodes.length < 1)) {
            throw new Error('cannot load empty XML document');
        }
        var firstChildIndex = (window.ActiveXObject && (xmlDoc.childNodes.length===2)) ? 1 : 0;
        rootNode = xmlDoc.childNodes[firstChildIndex];
        attrs = rootNode.attributes;

        // Determine if this is OpenIOC v1.0 or 1.1 and if the namespace is prefixed.
        var ioc10ns = ioc_v1_0_XmlNamespace.toLowerCase()
            , ioc11ns = ioc_v1_1_XmlNamespace.toLowerCase();


        for (i=0; i<attrs.length; i++) {
            if (attrs[i].value.toLowerCase() === ioc10ns) {
                return parseDocumentV1_0(rootNode, getPrefix(attrs[i].name));
            } else if (attrs[i].value.toLowerCase() === ioc11ns) {
                return parseDocumentV1_1(rootNode, getPrefix(attrs[i].name));
            }
        }

        // Assume it is version 1.0 or 1.1 based on the root element node name.
        if (rootNode.nodeName === 'ioc') {
            return parseDocumentV1_0(rootNode, '');
        } else if (rootNode.nodeName === 'OpenIOC') {
            return parseDocumentV1_1(rootNode, '');
        }

        // Error out If there is no namespace the root node name is not recognized.
        throw new Error('cannot determine IOC version by XML namespace or' +
            ' root element name');

        function getPrefix(str) {
            var match = str.match(/^xmlns:(.*)$/i);
            return (match) ? (match[1] + ':') : '';
        }
    }

    function parseDocumentV1_1(rootNode, xmlNsPrefix) {
        var node=rootNode, prefix=xmlNsPrefix, iocObject={}, n;
        // Ensure correct namespace if prefixed.
        // TODO: Chrome generates an HTML error document on parse error; check it.
        if (node.nodeName === ('OpenIOC')) {
            prefix='';
        }if (node.nodeName !== (prefix+'OpenIOC')) {
            throw new Error('unexpected document root element "'+node.nodeName+'"');
        }
        iocObject.id = node.getAttribute('id');
        iocObject.date_updated = node.getAttribute('last-modified');
        for (i=0; i<node.childNodes.length; i++) {
            n = node.childNodes[i];
            if (n.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) continue;
            switch (n.nodeName.toLowerCase()) {
                case (prefix.toLowerCase() +'metadata'): parseMetadata(n); break;
                case (prefix.toLowerCase() +'parameters'): break; // TODO: silently ignore parameters.
                case (prefix.toLowerCase() +'criteria'):
                    iocObject.definition = indicatorToJson(n, [], prefix);
                    break;
                case (prefix.toLowerCase() +'parsererror'):
                    throw new Error(n.children[1].textContent);
                default:
                    throw new Error('unexpected IOC element "'+n.nodeName+'"');
            }
        }
        // If successfully parsed then return the object.
        if (iocObject.definition) {
            return iocObject;
        } else {
            throw new Error('no "criteria" element was found');
        }
        function parseMetadata(metadataElement) {
            var children=metadataElement.childNodes, n, i;
            for (i=0; i<children.length; i++) {
                n = children[i];
                if (n.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) continue;
                switch (n.nodeName.toLowerCase()) {
                    case (prefix.toLowerCase() + 'short_description'): setText('name', n); break;
                    case (prefix.toLowerCase() + 'description'): setText('description', n); break;
                    case (prefix.toLowerCase() + 'keywords'): setText('keywords', n); break;
                    case (prefix.toLowerCase() + 'authored_by'): setText('author', n); break;
                    case (prefix.toLowerCase() + 'authored_date'): setText('date_created', n); break;
                    case (prefix.toLowerCase() + 'links'): iocObject.links = loadLinks(n, prefix); break;
                    default: throw new Error('unexpected metadata element "' + n.nodeName + '"');
                }
            }
        }
        function setText(property, node) {
            if (node.firstChild) { iocObject[property] = node.firstChild.data; }
        }
    }

    function parseDocumentV1_0(rootNode, xmlNsPrefix) {
        var node=rootNode, prefix=xmlNsPrefix, iocObject={}, n;
        // Ensure correct namespace if prefixed.
        // TODO: Chrome generates an HTML error document on parse error; check it.
        if (node.nodeName !== (prefix+'ioc')) {
            throw new Error('unexpected document root element "'+node.nodeName+'"');
        }
        iocObject.id = node.getAttribute('id');
        iocObject.date_updated = node.getAttribute('last-modified');
        for (i=0; i<node.childNodes.length; i++) {
            n = node.childNodes[i];
            if (n.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) continue;
            switch (n.nodeName.toLowerCase()) {
                case (prefix.toLowerCase() + 'short_description'): setText('name', n); break;
                case (prefix.toLowerCase() + 'description'): setText('description', n); break;
                case (prefix.toLowerCase() + 'keywords'): setText('keywords', n); break;
                case (prefix.toLowerCase() + 'authored_by'): setText('author', n); break;
                case (prefix.toLowerCase() + 'authored_date'): setText('date_created', n); break;
                case (prefix.toLowerCase() + 'links'):
                    iocObject.links = loadLinks(n, prefix); break;
                case (prefix+'definition'):
                    iocObject.definition = indicatorToJson(n, [], prefix);
                    break;
                case (prefix+'parsererror'):
                    throw new Error(n.children[1].textContent);
                default:
                    throw new Error('unexpected IOC element "'+n.nodeName+'"');
            }
        }
        function setText(property, node) {
            if (node.firstChild) { iocObject[property] = node.firstChild.data; }
        }
        // If successfully parsed then return the object.
        if (iocObject.definition) {
            return iocObject;
        } else {
            throw new Error('no "definition" element was found');
        }
    }

    // Generate a JSON tree object for use with jsTree from the IOC definition.
    function indicatorToJson(indicator, acc, prefix) {
        for (var i=0; i<indicator.childNodes.length; i++) {
            var n = indicator.childNodes[i];

            if (n.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) {
                continue;
            } else if (n.nodeName.toLowerCase() === (prefix.toLowerCase() +'indicator')) {
                acc.push({
                    id: n.getAttribute('id'),
                    operator: n.getAttribute('operator').toLowerCase(),
                    children: indicatorToJson(n, [], prefix)
                });
            } else if (n.nodeName.toLowerCase() === (prefix.toLowerCase() +'indicatoritem')) {
                acc.push(indicatorItemToJson(n, prefix));
            } else {
                throw new Error('unexpected indicator element "' + n.nodeName + '"');
            }
        }
        return acc;
    }

    // Loads the "links" section.
    function loadLinks(linksElement, prefix) {
        var links= new Array(), i, el;
        prefix = (prefix) ? prefix.toLowerCase() : '';
        for (i=0; i<linksElement.childNodes.length; i++) {
            el = linksElement.childNodes[i];
            if ((el.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) ||
                (el.nodeName.toLowerCase() !== (prefix+'link'))) { continue; }

            var rel =   el.getAttribute('rel')
                , title = el.getAttribute('title')
                , href = el.getAttribute('href')
                , text = $(el.childNodes[0]).text();
            var link ={rel:rel};

            if (title) { link.title = title; }
            if (href) { link.href = href; }
            if (text) { link.text = text; }

            if ( !links[rel] ) {
                links[rel] = new Array();
            }
            links[rel].push(link);
        }
        return links; // (links.length==0) ? undefined: links;
    }

    // Generates an indicator item string from an <IndicatorItem> element.
    function indicatorItemToJson(item, prefix) {
        var cond=item.getAttribute('condition'), id=item.getAttribute('id')
            , node, context, content, comment, term, value
            , negate=item.getAttribute('negate'), preservecase=item.getAttribute('preserve-case')
            , children=item.childNodes, len=children.length;
        // Find the context and content nodes.
        for (var i=0; i<len; i++) {
            node = children[i];
            if (node.nodeType !== 1/*IE: Node.ELEMENT_NODE*/) continue;
            switch (node.nodeName) {
                case (prefix+'Context'): context = node; break;
                case (prefix+'Content'): content = node; break;
                case (prefix+'Comment'): comment = node; break;
                default:
                    throw new Error('invalid IndicatorItem child node "' + node.nodeName + '"');
            }
        }
        if (!context) {
            throw new Error('IndicatorItem ' + id + ' has no Context child node');
        }
        if (!content) {
            throw new Error('IndicatorItem ' + id + ' has no Content child node');
        }
        term = context.getAttribute('search');
        value = $(content).text();
        comment = $(comment).text();
        return {id:id, term:term, condition:cond, value:value, comment:comment, negate:negate, preservecase:preservecase};
    }

    // Convert a parsed IOC object into HTML elements.
    plugin.convertToHtml = function(iocObject) {
        // Convert the header metadata items.
        var $viewer, $metadata, $content, i;
        $viewer = $('<div>').addClass('ioc').addClass('ioc-guid-' + iocObject.id)
            .append($metadata=$('<div>').addClass('ioc-metadata'))
            .append($criteria=$('<div>').addClass('ioc-definition'));
//        if (iocObject.name) {
//            $metadata.append($('<div>').addClass('ioc-name').html(iocObject.name));
//        }
        var uidline =  iocObject.id;
        if ( iocObject.links['threatgroup'] ) { uidline += " - " +iocObject.links['threatgroup'][0].text; }
        if ( iocObject.links['threatcategory'] ) { uidline += " - " +iocObject.links['threatcategory'][0].text; }
        if ( iocObject.links['mcirt'] ) { uidline += " - " +iocObject.links['mcirt'][0].text; }
        if ( iocObject.links['grade'] ) { uidline += " - " +iocObject.links['grade'][0].text; }

        $metadata.append($('<div>').addClass('ioc-uuid').html(uidline ));

        var metadataItems = [ ['author', 'Author'], ['date_created', 'Created'], ['date_updated', 'Updated']];
        for (i=0; i<metadataItems.length; i++) {
            var attr=metadataItems[i][0], label=metadataItems[i][1];
            if (iocObject[attr]) {
                $metadata.append($('<div>')
                    .append($('<span>').html(label + ': ').addClass('ioc-metadata-label'))
                    .append($('<span>').html(iocObject[attr])).addClass('ioc-metadata-value'));
            }
        }

        var links = iocObject.links;

        for ( var rel in links ) {
            if ( rel == 'mcirt') { continue; }
            if ( rel == 'threatgroup') { continue; }
            if ( rel == 'threatcategory') { continue; }
            if ( rel == 'grade') { continue; }
            if ( rel == 'link') { continue; }

            if ( links[rel].length == 1 ) {
                $metadata.append($("<DIV>").html(rel.toUpperCase()+': ').addClass('ioc-link-label')
                    .append(($('<span>').addClass('ioc-link')
                        .append($('<span>').html(links[rel][0].text).addClass('ioc-link-value')))));
            }
            else {

                var linkUL = $('<DIV>')
                    .append($('<span id="'+rel+'">')
                        .text(rel.toUpperCase()+'s:')
                        .click( function() { $( '#linktype_'+ this.id ).toggle('slow'); } )
                        .addClass('ioc-link-label')
                    );
                var LI = $('<DIV id="linktype_' +rel +'" >').addClass('ioc_hidden');

                for (i=0; i<links[rel].length; i++) {
                    LI.append(($li=$('<li>')
                        .append(($('<span>').addClass('ioc-link')
                            .append($('<span>').html(links[rel][i].text).addClass('ioc-link-value'))))));
                }
                linkUL.append( LI );
                $metadata.append(linkUL);
            }
        }

        if (links['link']){
            var linksUL = $('<DIV>').append($('<span>')
                .html('LINK(s):')
                .addClass('ioc-link-label')
                .css('text-decoration', 'underline')
                .click( function() {  $( '#linktype_link' ).toggle('slow'); } )
            );
            var LI = $('<div id="linktype_link">').addClass('ioc_hidden');
            LI.css('margin-left', '10px');
            for (i=0; i<links['link'].length; i++) {
                var str = links['link'][i].href;
                if ( !links['link'][i].href ) {
                    str = links['link'][i].text;
                }
                LI.append(($li=$('<li>')
                    .append(($('<A target="IOCNewTarget" href="' +str+'" \>')
                        .html(str)))));
            }
            linksUL.append( LI );
            $metadata.append(linksUL);
        }


        $metadata.append($('<div>')
            .addClass('ioc-description')
            .addClass('well well-sm')
            .html(iocObject.description));

        // Convert the logic tree.
        renderIndicator($criteria, iocObject.definition[0], 0);
        function renderIndicator(parentNode, indicator, depth) {
            var $ul=$('<ul>'), $li, $rule, nodes, node, content, labelText
                , isFirst, isLast
                , op=(indicator.operator && indicator.operator.toLowerCase());
            $ul.addClass('ioc-indicator');
            $ul.addClass('panel');
            $ul.addClass('panel-default');
            $ul.addClass('ioc-guid-' + indicator.id);
            $ul.append($('<span>').addClass('operator').text(op.toUpperCase()));
//      $ul.text( indicator.operator.toUpperCase());

            nodes = indicator.children;
            for (var i=0; i<nodes.length; i++) {
                node = nodes[i];
                // Create and append the indicator nodes.
                if (node.term) {
                    var negate='';
                    if ( node.negate === 'true' ) {
                        negate="NOT";
                    }

                    var preservecase='"';
                    if ( node.preservecase === 'true' ) {
                        preservecase="'";
                    }


                    $ul.append(($li=$('<li>')
                        .append($rule=$('<span>')
                            .addClass('ioc-rule')
                            .addClass('well')
                            .append($('<span>').addClass('ioc-negate').text(negate))
                            .append($('<span>').addClass('ioc-term').text(prepTerm(node.term)))
                            .append($('<span>').addClass('ioc-condition').text(node.condition))
                            .append($('<span>').addClass('ioc-value').text(preservecase +node.value +preservecase)))));
                    $li.addClass('no-nest').addClass('ioc-guid-' + node.id);
                    if (node.comment) {
                        $rule.attr('title', node.comment);
                        $rule.addClass('ioc-commented-rule');
                    }
                } else {
                    $ul.append( $li=$('<li>') );
                    renderIndicator($li, node, depth + 1);
                }
            }
            parentNode.append($ul);
        }
        function prepTerm(str) {
            return str.replace(/Item/,'');
        }
        return $viewer;
    };

    // Set the plugin version number.
    plugin.version = '0.2.0';

    // Export the plugin to jQuery.
    $.fn.iocViewer = plugin;

})(jQuery);
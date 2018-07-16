export function generateUniqueId(sigmaInstance, isNode) {
    var i = Math.floor(Math.random() * (100000 - 10 + 1)) + 10;
    if (isNode) {
        while (typeof sigmaInstance.graph.nodes(i) !== 'undefined') {
            i = Math.floor(Math.random() * (100000 - 10 + 1)) + 10;
        }
    } else {
        while (typeof sigmaInstance.graph.edges(i) !== 'undefined') {
            i = Math.floor(Math.random() * (100000 - 10 + 1)) + 10;
        }
    }

    return i;
}

//Recursive function to highlight paths to start/end nodes
export function findGraphPath(sigmaInstance, reverse, nodeid, traversed) {
    let target = reverse ? appStore.startNode : appStore.endNode;
    traversed.push(nodeid);
    //This is our stop condition for recursing
    if (nodeid !== target.id) {
        var edges = sigmaInstance.graph.adjacentEdges(nodeid);
        var nodes = reverse ? sigmaInstance.graph.inboundNodes(nodeid) : sigmaInstance.graph.outboundNodes(nodeid);
        //Loop over the nodes near us and the edges connecting to those nodes
        $.each(nodes, function (index, node) {
            $.each(edges, function (index, edge) {
                var check = reverse ? edge.source : edge.target;
                //If an edge is pointing in the right direction, set its color
                //Push the edge into our store and then 
                node = parseInt(node);
                if (check === node && !traversed.includes(node)) {
                    edge.color = reverse ? 'blue' : 'red';
                    appStore.highlightedEdges.push(edge);
                    findGraphPath(sigmaInstance, reverse, node, traversed);
                }
            });
        });
    } else {
        return;
    }
}

export function clearSessions() {
    emitter.emit('openClearingModal');
    deleteSessions();
}

function deleteSessions() {
    var session = driver.session();
    session.run("MATCH ()-[r:HasSession]-() WITH r LIMIT 100000 DELETE r RETURN count(r)")
        .then(function (results) {
            session.close();
            emitter.emit("refreshDBData");
            var count = results.records[0]._fields[0].low;
            if (count === 0) {
                emitter.emit('hideDBClearModal');
            } else {
                deleteSessions();
            }
        });
}

export function clearDatabase() {
    emitter.emit('openClearingModal');
    deleteEdges();
}

function deleteEdges() {
    var session = driver.session();
    session.run("MATCH ()-[r]-() WITH r LIMIT 100000 DELETE r RETURN count(r)")
        .then(function (results) {
            emitter.emit("refreshDBData");
            session.close();
            var count = results.records[0]._fields[0].low;
            if (count === 0) {
                deleteNodes();
            } else {
                deleteEdges();
            }
        });
}

function deleteNodes() {
    var session = driver.session();
    session.run("MATCH (n) WITH n LIMIT 100000 DELETE n RETURN count(n)")
        .then(function (results) {
            emitter.emit("refreshDBData");
            session.close();
            var count = results.records[0]._fields[0].low;
            if (count === 0) {
                grabConstraints();
            } else {
                deleteNodes();
            }
        });
}

function grabConstraints() {
    var session = driver.session();
    let constraints = [];
    session.run("CALL db.constraints")
        .then(function (results) {
            $.each(results.records, function (index, container) {
                let constraint = container._fields[0];
                let query = "DROP " + constraint;
                constraints.push(query);
            });

            session.close();

            dropConstraints(constraints);
        });
}

function dropConstraints(constraints) {
    if (constraints.length > 0) {
        let constraint = constraints.shift();
        let session = driver.session();
        session.run(constraint)
            .then(function () {
                dropConstraints(constraints);
                session.close();
            });
    } else {
        grabIndexes();
    }
}

function grabIndexes() {
    var session = driver.session();
    let constraints = [];

    session.run("CALL db.indexes")
        .then(function (results) {
            $.each(results.records, function (index, container) {
                let constraint = container._fields[0];
                let query = "DROP " + constraint;
                constraints.push(query);
            });

            session.close();

            dropIndexes(constraints);
        });
}

function dropIndexes(indexes) {
    if (indexes.length > 0) {
        let constraint = indexes.shift();
        let session = driver.session();
        session.run(constraint)
            .then(function () {
                dropConstraints(indexes);
                session.close();
            });
    } else {
        addConstraints();
    }
}

function addConstraints() {
    var s1 = driver.session();
    var s2 = driver.session();
    var s3 = driver.session();
    var s4 = driver.session();
    var s5 = driver.session();
    var s6 = driver.session();

    s1.run("CREATE CONSTRAINT ON (c:User) ASSERT c.name IS UNIQUE")
        .then(function () {
            s1.close();
            s2.run("CREATE CONSTRAINT ON (c:Computer) ASSERT c.name IS UNIQUE")
                .then(function () {
                    s2.close();
                    s3.run("CREATE CONSTRAINT ON (c:Group) ASSERT c.name IS UNIQUE")
                        .then(function () {
                            s3.close();
                            s4.run("CREATE CONSTRAINT ON (c:Domain) ASSERT c.name IS UNIQUE")
                                .then(function () {
                                    s4.close();
                                    s5.run("CREATE CONSTRAINT on (c:OU) ASSERT c.guid IS UNIQUE")
                                        .then(function () {
                                            s5.close();
                                            s6.run("CREATE CONSTRAINT on (c:GPO) ASSERT c.name is UNIQUE")
                                                .then(function () {
                                                    s6.close();
                                                })
                                                .catch(function () {
                                                    s6.close();
                                                });
                                        })
                                        .catch(function () {
                                            s5.close();
                                        });
                                })
                                .catch(function () {
                                    s4.close();
                                });
                        })
                        .catch(function () {
                            s3.close();
                        });
                })
                .catch(function () {
                    s2.close();
                });
        })
        .catch(function () {
            s1.close();
        });

    emitter.emit('hideDBClearModal');
}

function processAceArray(array, objname, objtype, output) {
    let baseAceQuery = 'UNWIND {props} AS prop MERGE (a:{} {name:prop.principal}) MERGE (b:{} {name: prop.obj}) MERGE (a)-[r:{} {isacl:true}]->(b)'

    $.each(array, function (_, ace) {
        let principal = ace.PrincipalName;
        let principaltype = ace.PrincipalType;
        let right = ace.RightName;
        let acetype = ace.AceType;

        if (objname === principal) {
            return;
        }

        let rights = []

        //Process the right/type to figure out the ACEs we need to add
        if (acetype === 'All') {
            rights.push('AllExtendedRights');
        } else if (acetype === 'User-Force-Change-Password') {
            rights.push('ForceChangePassword');
        } else if (acetype === 'Member') {
            rights.push('AddMember');
        } else if (right === 'ExtendedRight') {
            rights.push(acetype);
        }

        if (right.includes('GenericAll')) {
            rights.push('GenericAll');
        }

        if (right.includes('WriteDacl')) {
            rights.push('WriteDacl');
        }

        if (right.includes('WriteOwner')) {
            rights.push('WriteOwner');
        }

        if (right.includes('GenericWrite')) {
            rights.push('GenericWrite');
        }

        if (right === 'Owner') {
            rights.push('Owns');
        }

        $.each(rights, function (_, right) {
            let hash = right + principaltype;
            let formatted = baseAceQuery.format(principaltype.toTitleCase(), objtype, right);

            insert(output, hash, formatted, { principal: principal, obj: objname });
        })
    })
}

export function buildDomainJson(chunk) {
    let queries = {}
    queries.properties = {
        statement: "UNWIND {props} AS prop MERGE (n:Domain {name:prop.name}) SET n += prop.map",
        props: []
    };

    queries.links = {
        statement: 'UNWIND {props} as prop MERGE (n:Domain {name:prop.domain}) MERGE (m:GPO {name:prop.gpo}) MERGE (m)-[r:GpLink {enforced:prop.enforced, isacl:false}]->(n)',
        props: []
    }

    queries.trusts = {
        statement: 'UNWIND {props} AS prop MERGE (n:Domain {name: prop.a}) MERGE (m:Domain {name: prop.b}) MERGE (n)-[:TrustedBy {trusttype : prop.trusttype, transitive: prop.transitive, isacl:false}]->(m)',
        props: []
    }

    queries.childous = {
        statement: "UNWIND {props} AS prop MERGE (n:Domain {name:prop.domain}) MERGE (m:OU {guid:prop.guid}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    queries.computers = {
        statement: "UNWIND {props} AS prop MERGE (n:Domain {name:prop.domain}) MERGE (m:Computer {name:prop.comp}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    queries.users = {
        statement: "UNWIND {props} AS prop MERGE (n:Domain {name:prop.domain}) MERGE (m:User {name:prop.user}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    $.each(chunk, function (_, domain) {
        let name = domain.Name;
        let properties = domain.Properties;

        queries.properties.props.push({ map: properties, name: name });

        let links = domain.Links;
        $.each(links, function (_, link) {
            let enforced = link.IsEnforced;
            let target = link.Name;

            queries.links.props.push({ domain: name, gpo: target, enforced: enforced });
        });

        let trusts = domain.Trusts;
        $.each(trusts, function (_, trust) {
            let target = trust.TargetName;
            let transitive = trust.IsTransitive;
            let direction = trust.TrustDirection;
            let type = trust.TrustType;

            switch (direction) {
                case 0:
                    queries.trusts.props.push({ a: target, b: name, transitive: transitive, trusttype: type });
                    break;
                case 1:
                    queries.trusts.props.push({ a: name, b: target, transitive: transitive, trusttype: type });
                    break;
                case 2:
                    queries.trusts.props.push({ a: name, b: target, transitive: transitive, trusttype: type });
                    queries.trusts.props.push({ a: target, b: name, transitive: transitive, trusttype: type });
                    break;
            }
        });

        let aces = domain.Aces;
        processAceArray(aces, name, "Domain", queries);

        let childous = domain.ChildOus;

        $.each(childous, function (_, ou) {
            queries.childous.props.push({ domain: name, guid: ou })
        })

        let comps = domain.Computers;
        $.each(comps, function (_, computer) {
            queries.computers.props.push({ domain: name, comp: computer })
        })

        let users = domain.Users
        $.each(users, function (_, user) {
            queries.users.props.push({ domain: name, user: user });
        });
    });

    return queries;
}

export function buildGpoJson(chunk) {
    let queries = {}
    queries.properties = {
        statement: "UNWIND {props} AS prop MERGE (n:GPO {name:prop.name}) SET n.guid=prop.guid",
        props: []
    }

    $.each(chunk, function (_, gpo) {
        let name = gpo.Name;
        let guid = gpo.Guid;
        queries.properties.props.push({ name: name, guid: guid });

        let aces = gpo.Aces;
        processAceArray(aces, name, "GPO", queries);
    });

    return queries;
}

export function buildGroupJson(chunk) {
    let queries = {}
    queries.properties = {
        statement: "UNWIND {props} AS prop MERGE (n:Group {name:prop.name}) SET n += prop.map",
        props: []
    }

    let baseStatement = "UNWIND {props} AS prop MERGE (n:Group {name: prop.name}) MERGE (m:{} {name:prop.member}) MERGE (m)-[r:MemberOf {isacl:false}]->(n)";

    $.each(chunk, function (_, group) {
        let name = group.Name;
        let properties = group.Properties;

        queries.properties.props.push({ map: properties, name: name });

        let aces = group.Aces;
        processAceArray(aces, name, "Group", queries);

        let members = group.Members;
        $.each(members, function (_, member) {
            let mname = member.MemberName;
            let mtype = member.MemberType;

            let statement = baseStatement.format(mtype.toTitleCase())
            insert(queries, mtype, statement, { name: name, member: mname })
        });
    });

    return queries
}

export function buildOuJson(chunk) {
    let queries = {};

    queries.properties = {
        statement: "UNWIND {props} AS prop MERGE (n:OU {guid:prop.guid}) SET n += prop.map",
        props: []
    }

    queries.childous = {
        statement: "UNWIND {props} AS prop MERGE (n:OU {guid:prop.parent}) MERGE (m:OU {guid:prop.child}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    queries.computers = {
        statement: "UNWIND {props} AS prop MERGE (n:OU {guid:prop.ou}) MERGE (m:Computer {name:prop.comp}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    queries.users = {
        statement: "UNWIND {props} AS prop MERGE (n:OU {guid:prop.ou}) MERGE (m:User {name:prop.user}) MERGE (n)-[r:Contains {isacl:false}]->(m)",
        props: []
    }

    $.each(chunk, function (_, ou) {
        let guid = ou.Guid;
        let properties = ou.Properties;

        queries.properties.props.push({ guid: guid, map: properties });

        let childous = ou.ChildOus;
        $.each(childous, function (_, cou) {
            queries.childous.props.push({ parent: guid, child: cou });
        })

        let computers = ou.Computers;
        $.each(computers, function (_, computer) {
            queries.computers.props.push({ ou: guid, comp: computer })
        })

        let users = ou.Users
        $.each(users, function (_, user) {
            queries.users.props.push({ ou: guid, user: user });
        });
    })

    return queries;
}

export function buildSessionJson(chunk) {
    let queries = {}
    queries.sessions = {
        statement: "UNWIND {props} AS prop MERGE (n:User {name:prop.user}) MERGE (m:Computer {name:prop.comp}) MERGE (m)-[r:HasSession {weight: prop.weight, isacl:false}]->(n)",
        props: []
    }

    $.each(chunk, function (_, session) {
        let name = session.UserName;
        let comp = session.ComputerName;
        let weight = session.Weight;

        queries.sessions.props.push({ user: name, comp: comp, weight: weight })
    })
    return queries;
}

export function buildGpoAdminJson(chunk) {
    let queries = {}

    let baseQuery = "UNWIND {props} AS prop MERGE (n:{} {name:prop.admin}) MERGE (m:Computer {name:prop.comp}) MERGE (n)-[r:AdminTo {isacl:false}]->(m)"
    $.each(chunk, function (_, gpoadmin) {
        let comp = gpoadmin.Computer;
        let admin = gpoadmin.Name;
        let type = gpoadmin.Type;

        let query = baseQuery.format(type.toTitleCase());
        insert(queries, type, query, { admin: admin, comp: comp })
    });

    return queries;
}

export function buildUserJson(chunk) {
    let queries = {}

    $.each(chunk, function (_, user) {
        let name = user.Name;
        let properties = user.Properties;
        let primarygroup = user.PrimaryGroup;

        if (!queries.properties) {
            if (primarygroup === null) {
                queries.properties = {
                    statement: "UNWIND {props} AS prop MERGE (n:User {name:prop.name}) SET n += prop.map",
                    props: []
                }
            } else {
                queries.properties = {
                    statement: "UNWIND {props} AS prop MERGE (n:User {name:prop.name}) MERGE (m:Group {name:prop.pg}) MERGE (n)-[r:MemberOf {isacl:false}]->(m) SET n += prop.map",
                    props: []
                }
            }
        }

        queries.properties.props.push({ map: properties, name: name, pg: primarygroup });

        let aces = user.Aces;
        processAceArray(aces, name, "User", queries);
    });
    return queries
}

export function buildComputerJson(chunk) {
    let queries = {}
    let baseQuery = "UNWIND {props} AS prop MERGE (n:Computer {name:prop.name}) MERGE (m:{} {name:prop.target}) MERGE (m)-[r:{} {isacl: false}]->(n)"

    $.each(chunk, function (_, comp) {
        let name = comp.Name;
        let properties = comp.Properties;
        let localadmins = comp.LocalAdmins;
        let rdpers = comp.RemoteDesktopUsers;
        let primarygroup = comp.PrimaryGroup;

        if (!queries.properties) {
            if (primarygroup === null) {
                queries.properties = {
                    statement: "UNWIND {props} AS prop MERGE (n:Computer {name:prop.name}) SET n += prop.map",
                    props: []
                }
            } else {
                queries.properties = {
                    statement: "UNWIND {props} AS prop MERGE (n:Computer {name:prop.name}) MERGE (m:Group {name:prop.pg}) MERGE (n)-[r:MemberOf {isacl:false}]->(m) SET n += prop.map",
                    props: []
                }
            }
        }

        queries.properties.props.push({ map: properties, name: name, pg: primarygroup });
        $.each(localadmins, function (_, admin) {
            let aType = admin.Type;
            let aName = admin.Name;
            let rel = "AdminTo";

            let hash = rel + aType;

            let statement = baseQuery.format(aType, rel);
            let p = { name: name, target: aName };
            insert(queries, hash, statement, p);
        })

        $.each(rdpers, function (_, rdp) {
            let aType = rdp.Type;
            let aName = rdp.Name;
            let rel = "CanRDP";

            let hash = rel + aType;

            let statement = baseQuery.format(aType, rel);
            let p = { name: name, target: aName };
            insert(queries, hash, statement, p);
        })
    });
    return queries
}

function insert(obj, hash, statement, prop) {
    if (obj[hash]) {
        obj[hash].props.push(prop)
    } else {
        obj[hash] = {}
        obj[hash].statement = statement;
        obj[hash].props = []
        obj[hash].props.push(prop)
    }
}

export function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

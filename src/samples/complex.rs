use eggplant::dashmap;
use eggplant::egglog;
use eggplant::prelude::*;
fn ivt_finish_passthrough_pat<PR: PatRecSgl>() -> IvtFinishPassthroughPat<PR> {
    let loop_body = schema_dsl::Expr::query_leaf();
    let if_eclass = schema_dsl::Expr::query_leaf();
    let pred = schema_dsl::Expr::query_leaf();
    let inputs = schema_dsl::Expr::query_leaf();
    let then_branch = schema_dsl::Expr::query_leaf();
    let else_branch = schema_dsl::Expr::query_leaf();
    let perm = schema_dsl::Expr::query_leaf();
    let pperm = schema_dsl::Expr::query_leaf();
    let passthrough_tys = schema_dsl::TypeList::query_leaf();
    let len = BaseVar::<i64, PR>::query_named("ivt_len");
    let if_len = BaseVar::<i64, PR>::query_named("ivt_if_len");
    let arg_ty = schema_dsl::Type::query_leaf();
    let arg_ctx = schema_dsl::Assumption::query_leaf();
    let arg_get = schema_dsl::Get::query(&schema_dsl::Arg::query(&arg_ty, &arg_ctx));
    let loop_get = schema_dsl::Get::query(&loop_body);
    let new_ty = schema_dsl::BaseType::query_leaf();
    let new_base_ty = schema_dsl::Base::query(&new_ty);
    let arg_has_base_type = schema_dsl::HasType::query();
    let curr = schema_dsl::Single::query(&arg_get);
    let arg_has_base_type_matches_arg = arg_has_base_type.expr.handle().eq(&arg_get.handle());
    let arg_has_base_type_matches_ty = arg_has_base_type.ty.handle().eq(&new_base_ty.handle());
    let loop_matches_arg = loop_get.handle().eq(&arg_get.handle());
    let shifted_index = loop_get
        .handle_index()
        .eq(&(arg_get.handle_index() + (&1_i64).as_handle()));
    let ifnode = schema_dsl::IfNode::query(&if_eclass, &pred, &inputs, &then_branch, &else_branch);
    let analysis = schema_dsl::IVTAnalysisRes::query(&perm, &pperm, &passthrough_tys);
    let analysis_matches = analysis
        .handle()
        .eq(&ivt_new_inputs_analysis_impl::query(&loop_body, &curr, &ifnode).handle());
    let len_matches = analysis.handle_len().eq(&len.handle());
    let if_len_known = if_len
        .handle()
        .eq(&schema_dsl::TupleLength::query(&if_eclass).handle());

    IvtFinishPassthroughPat::new(
        loop_body,
        if_eclass,
        pred,
        inputs,
        then_branch,
        else_branch,
        perm,
        pperm,
        passthrough_tys,
        len,
        if_len,
        arg_get,
        arg_has_base_type,
        new_ty,
    )
    .assert(arg_has_base_type_matches_arg)
    .assert(arg_has_base_type_matches_ty)
    .assert(analysis_matches)
    .assert(len_matches)
    .assert(if_len_known)
    .assert(loop_matches_arg)
    .assert(shifted_index)
}
fn main() {
    PeepholeTx::add_rule(
        "ivt_analysis_finish_passthrough_access",
        ruleset,
        ivt_finish_passthrough_pat,
        |ctx, pat| {
            let tmp_type = ctx.insert_tmp_type();
            let no_ctx = ctx.insert_in_func("no-ctx".to_owned());
            let tmp_arg = ctx.insert_arg(tmp_type, no_ctx);
            let len = ctx.devalue(pat.len);
            let if_len = ctx.devalue(pat.if_len);
            let get_passed_through = ctx.insert_single(ctx.insert_get(tmp_arg, if_len + len));
            let new_perm = ctx.insert_concat(pat.perm, get_passed_through);
            let original_get_index =
                ctx.insert_single(ctx.insert_get(tmp_arg, ctx.devalue(pat.arg_get.index)));
            let new_pperm = ctx.insert_concat(pat.pperm, original_get_index);
            let tnil = ctx.insert_t_nil();
            let new_passthrough_tys =
                ctx.insert_tl_concat(pat.passthrough_tys, ctx.insert_t_cons(pat.new_ty, tnil));
            let ifnode = ctx.insert_if_node(
                pat.if_eclass,
                pat.pred,
                pat.inputs,
                pat.then_branch,
                pat.else_branch,
            );
            let res =
                ctx.insert_ivt_analysis_res(new_perm, new_pperm, new_passthrough_tys, len + 1);
            ctx.set_ivt_new_inputs_analysis(pat.loop_body, ifnode, res);
        },
    );
}

#[eggplant::dsl]
pub(crate) enum BaseType {
    #[eggplant::typst("int")]
    #[eggplant::precedence(100)]
    IntT {},
    #[eggplant::typst("bool")]
    #[eggplant::precedence(100)]
    BoolT {},
    #[eggplant::typst("float")]
    #[eggplant::precedence(100)]
    FloatT {},
    #[eggplant::typst("{ty}^*")]
    #[eggplant::precedence(95)]
    PointerT { ty: BaseType },
    #[eggplant::typst("state")]
    #[eggplant::precedence(100)]
    StateT {},
}

#[eggplant::dsl]
pub(crate) enum TypeList {
    #[eggplant::typst("()")]
    #[eggplant::precedence(100)]
    TNil {},
    #[eggplant::typst("{head}, {tail}")]
    #[eggplant::precedence(10)]
    TCons { head: BaseType, tail: TypeList },
    #[eggplant::typst("concat {lhs}, {rhs}")]
    #[eggplant::precedence(10)]
    TLConcat { lhs: TypeList, rhs: TypeList },
    #[eggplant::typst("remove {tylist} at {idx}")]
    #[eggplant::precedence(95)]
    TypeListRemoveAt { tylist: TypeList, idx: i64 },
}

#[eggplant::dsl]
pub(crate) enum Type {
    #[eggplant::typst("{ty}")]
    #[eggplant::precedence(100)]
    Base { ty: BaseType },
    #[eggplant::typst("({tys})")]
    #[eggplant::precedence(95)]
    TupleT { tys: TypeList },
    #[eggplant::typst("tmp_type")]
    #[eggplant::precedence(100)]
    TmpType {},
}

#[eggplant::dsl]
pub(crate) enum Expr {
    #[eggplant::typst("opaque")]
    #[eggplant::precedence(100)]
    Opaque {},
    #[eggplant::typst("arg")]
    #[eggplant::precedence(95)]
    Arg { ty: Type, assumption: Assumption },
    #[eggplant::typst("const({constant}, {ty}, {assumption})")]
    #[eggplant::precedence(95)]
    Const {
        constant: Constant,
        ty: Type,
        assumption: Assumption,
    },
    #[eggplant::typst("empty:{ty}")]
    #[eggplant::precedence(95)]
    Empty { ty: Type, assumption: Assumption },
    #[eggplant::typst("{op} {a}: {b} ? {c})")]
    #[eggplant::precedence(30)]
    Top {
        op: TernaryOp,
        a: Expr,
        b: Expr,
        c: Expr,
    },
    #[eggplant::typst("{lhs} {op} {rhs}")]
    #[eggplant::precedence(60)]
    Bop { op: BinaryOp, lhs: Expr, rhs: Expr },
    #[eggplant::typst("{op}({expr})")]
    #[eggplant::precedence(80)]
    Uop { op: UnaryOp, expr: Expr },
    #[eggplant::typst("{expr}_{index}")]
    #[eggplant::precedence(90)]
    Get { expr: Expr, index: i64 },
    #[eggplant::typst("alloc({id}, {amount}, {state_edge}, {pointer_ty})")]
    #[eggplant::precedence(30)]
    Alloc {
        id: i64,
        amount: Expr,
        state_edge: Expr,
        pointer_ty: BaseType,
    },
    #[eggplant::typst("call({name}, {arg})")]
    #[eggplant::precedence(30)]
    Call { name: String, arg: Expr },
    #[eggplant::typst("{expr}")]
    #[eggplant::precedence(100)]
    Single { expr: Expr },
    #[eggplant::typst("{expr1}, {expr2}")]
    #[eggplant::precedence(20)]
    Concat { expr1: Expr, expr2: Expr },
    #[eggplant::typst("switch({pred}, {inputs}, {branches})")]
    #[eggplant::precedence(20)]
    Switch {
        pred: Expr,
        inputs: Expr,
        branches: ListExpr,
    },
    #[eggplant::typst("if({pred}, {inputs}, {then_branch}, {else_branch})")]
    #[eggplant::precedence(20)]
    If {
        pred: Expr,
        inputs: Expr,
        then_branch: Expr,
        else_branch: Expr,
    },
    #[eggplant::typst("do_while({input}, {pred_and_body})")]
    #[eggplant::precedence(20)]
    DoWhile { input: Expr, pred_and_body: Expr },
    #[eggplant::typst("function({name}, {input_ty}, {output_ty}, {output})")]
    #[eggplant::precedence(20)]
    Function {
        name: String,
        input_ty: Type,
        output_ty: Type,
        output: Expr,
    },
    #[eggplant::typst("addctx {assumption}, {expr}")]
    #[eggplant::precedence(20)]
    AddContext { assumption: Assumption, expr: Expr },
    #[eggplant::typst("subtuple {expr}, {start}, {len}")]
    #[eggplant::precedence(20)]
    SubTuple { expr: Expr, start: i64, len: i64 },
    #[eggplant::typst("subst {assumption}, {to}, {expr}")]
    #[eggplant::precedence(20)]
    Subst {
        assumption: Assumption,
        to: Expr,
        expr: Expr,
    },
    #[eggplant::typst("delayed_subst {lhs} to {rhs}")]
    #[eggplant::precedence(20)]
    DelayedSubstUnion { lhs: Expr, rhs: Expr },
    #[eggplant::typst("term_subst {assumption}, {expr}, {term}")]
    #[eggplant::precedence(20)]
    TermSubst {
        assumption: Assumption,
        expr: Expr,
        term: Term,
    },
    #[eggplant::typst("drop {ctx} at {idx} in {expr}")]
    #[eggplant::precedence(20)]
    DropAt {
        context: Assumption,
        idx: i64,
        expr: Expr,
    },
    #[eggplant::typst("delayed_drop {lhs} at {idx} in {rhs}")]
    #[eggplant::precedence(20)]
    DelayedDropUnion { lhs: Expr, rhs: Expr },
    #[eggplant::typst("drop_at_internal {ty} {context} at {idx} in {expr}")]
    #[eggplant::precedence(20)]
    DropAtInternal {
        ty: Type,
        context: Assumption,
        idx: i64,
        expr: Expr,
    },
    #[eggplant::typst("tuple_remove_at {tuple} at {idx}")]
    #[eggplant::precedence(20)]
    TupleRemoveAt { tuple: Expr, idx: i64 },
}

#[eggplant::dsl]
pub(crate) enum ListExpr {
    #[eggplant::typst("{head}, {tail}")]
    #[eggplant::precedence(10)]
    Cons { head: Expr, tail: ListExpr },
    #[eggplant::typst("()")]
    #[eggplant::precedence(100)]
    Nil {},
}

#[eggplant::dsl]
pub(crate) enum IVTRes {
    #[eggplant::typst("ivt_res({perm}, {passthrough_perm}, {passthrough_tys}, {len})")]
    #[eggplant::precedence(100)]
    IVTAnalysisRes {
        perm: Expr,
        passthrough_perm: Expr,
        passthrough_tys: TypeList,
        len: i64,
    },
    #[eggplant::precedence(95)]
    #[eggplant::typst("ivt_min {lhs}, {rhs}")]
    IVTMin { lhs: IVTRes, rhs: IVTRes },
}

#[eggplant::dsl]
pub(crate) enum Node {
    #[eggplant::typst("if({pred}, {inputs}, {then_branch}, {else_branch})")]
    #[eggplant::precedence(100)]
    IfNode {
        if_eclass: Expr,
        pred: Expr,
        inputs: Expr,
        then_branch: Expr,
        else_branch: Expr,
    },
}

#[eggplant::dsl]
pub(crate) enum Term {
    #[eggplant::typst("opaque")]
    #[eggplant::precedence(100)]
    OpaqueTerm {},
    #[eggplant::typst("arg")]
    #[eggplant::precedence(100)]
    TermArg {},
    #[eggplant::typst("{constant}")]
    #[eggplant::precedence(95)]
    TermConst { constant: Constant },
    #[eggplant::typst("empty")]
    #[eggplant::precedence(100)]
    TermEmpty {},
    #[eggplant::typst("top({op}, {a}, {b}, {c})")]
    #[eggplant::precedence(30)]
    TermTop {
        op: TernaryOp,
        a: Term,
        b: Term,
        c: Term,
    },
    #[eggplant::typst("{lhs} {op} {rhs}")]
    #[eggplant::precedence(60)]
    TermBop { op: BinaryOp, lhs: Term, rhs: Term },
    #[eggplant::typst("{op}({expr})")]
    #[eggplant::precedence(80)]
    TermUop { op: UnaryOp, expr: Term },
    #[eggplant::typst("{term}_{index}")]
    #[eggplant::precedence(90)]
    TermGet { term: Term, index: i64 },
    #[eggplant::typst("alloc({id}, {amount}, {state_edge}, {pointer_ty})")]
    #[eggplant::precedence(30)]
    TermAlloc {
        id: i64,
        amount: Term,
        state_edge: Term,
        pointer_ty: BaseType,
    },
    #[eggplant::typst("call({name}, {arg})")]
    #[eggplant::precedence(30)]
    TermCall { name: String, arg: Term },
    #[eggplant::typst("{term}")]
    #[eggplant::precedence(100)]
    TermSingle { term: Term },
    #[eggplant::typst("{term1}, {term2}")]
    #[eggplant::precedence(20)]
    TermConcat { term1: Term, term2: Term },
}

#[eggplant::dsl]
pub(crate) enum ListTerm {
    #[eggplant::typst("{head}, {tail}")]
    #[eggplant::precedence(10)]
    TermCons { head: Term, tail: ListTerm },
    #[eggplant::typst("()")]
    #[eggplant::precedence(100)]
    TermNil {},
}

#[eggplant::dsl]
pub(crate) enum ProgramType {
    #[eggplant::typst("program({entry}, {other_functions})")]
    #[eggplant::precedence(20)]
    Program {
        entry: Expr,
        other_functions: ListExpr,
    },
}

#[eggplant::dsl]
pub(crate) enum Assumption {
    #[eggplant::typst("in_func({name})")]
    #[eggplant::precedence(100)]
    InFunc { name: String },
    #[eggplant::typst("in_loop({input}, {pred_output})")]
    #[eggplant::precedence(100)]
    InLoop { input: Expr, pred_output: Expr },
    #[eggplant::typst("in_switch({branch}, {pred}, {input})")]
    #[eggplant::precedence(100)]
    InSwitch {
        branch: i64,
        pred: Expr,
        input: Expr,
    },
    #[eggplant::typst("in_if({pred_is_true}, {pred}, {input})")]
    #[eggplant::precedence(100)]
    InIf {
        pred_is_true: bool,
        pred: Expr,
        input: Expr,
    },
    #[eggplant::precedence(100)]
    TmpCtx {},
    #[eggplant::precedence(100)]
    LoopUnrollTmpCtx {},
    #[eggplant::precedence(100)]
    DummyLoopContext {
        inputs: Expr,
        pred_outputs: Expr,
        old_pred_outputs: Expr,
    },
    #[eggplant::precedence(100)]
    LsrTmpCtx {
        inputs: Expr,
        pred_outputs: Expr,
        invariant: Expr,
    },
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for Type<T>
where
    Type<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for BaseType<T>
where
    BaseType<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for Expr<T>
where
    Expr<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for ListExpr<T>
where
    ListExpr<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for TypeList<T>
where
    TypeList<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for Term<T>
where
    Term<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for Assumption<T>
where
    Assumption<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for TernaryOp<T>
where
    TernaryOp<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for BinaryOp<T>
where
    BinaryOp<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

impl<T: eggplant::wrap::NodeDropperSgl> std::fmt::Debug for UnaryOp<T>
where
    UnaryOp<T>: EgglogNode,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.cur_sym())
    }
}

#[eggplant::func(output = i64, no_merge)]
pub(crate) struct TupleLength {
    expr: Expr,
}

#[eggplant::func(output = i64, no_merge)]
pub(crate) struct TypeListLength {
    tylist: TypeList,
}

#[eggplant::relation]
pub(crate) struct ContextOf {
    pub(crate) expr: Expr,
    pub(crate) ctx: Assumption,
}

#[eggplant::relation]
pub(crate) struct HasArgType {
    pub(crate) expr: Expr,
    pub(crate) ty: Type,
}

#[eggplant::relation]
pub(crate) struct HasType {
    pub(crate) expr: Expr,
    pub(crate) ty: Type,
}

#[eggplant::relation]
pub(crate) struct ExprIsPure {
    pub(crate) expr: Expr,
}

#[eggplant::relation]
pub(crate) struct ExprIsResolved {
    pub(crate) expr: Expr,
}

#[eggplant::relation]
pub(crate) struct PureBaseType {
    pub(crate) ty: BaseType,
}

#[eggplant::relation]
pub(crate) struct PureType {
    pub(crate) ty: Type,
}

#[eggplant::relation]
pub(crate) struct PureTypeList {
    pub(crate) tylist: TypeList,
}

#[eggplant::relation]
pub(crate) struct InvCodeMotionCandidate {
    pub(crate) e1: Expr,
    pub(crate) e2: Expr,
}

#[eggplant::relation]
pub(crate) struct ExtractedExprCache {
    pub(crate) term: Term,
    pub(crate) expr: Expr,
    pub(crate) ctx: Assumption,
}

#[eggplant::relation]
pub(crate) struct IVTNewInputsAnalysisDemand {
    pub(crate) expr: Expr,
}

#[eggplant::relation]
pub(crate) struct TernaryOpIsPure {
    pub(crate) op: TernaryOp,
}

#[eggplant::relation]
pub(crate) struct BinaryOpIsPure {
    pub(crate) op: BinaryOp,
}

#[eggplant::relation]
pub(crate) struct UnaryOpIsPure {
    pub(crate) op: UnaryOp,
}

#[eggplant::relation]
pub(crate) struct NoAlias {
    pub(crate) lhs: Expr,
    pub(crate) rhs: Expr,
}

#[eggplant::relation]
pub(crate) struct IsIsEven {
    pub(crate) expr: Expr,
    pub(crate) input: Expr,
}

#[allow(non_camel_case_types)]
#[eggplant::relation]
pub(crate) struct NTZIterations {
    pub(crate) loop_expr: Expr,
    pub(crate) input: Expr,
    pub(crate) index: i64,
}

#[eggplant::relation]
pub(crate) struct BodyContainsExpr {
    pub(crate) body: Expr,
    pub(crate) expr: Expr,
}

#[eggplant::relation]
pub(crate) struct BodyContainsListExpr {
    pub(crate) body: Expr,
    pub(crate) list: ListExpr,
}

#[eggplant::relation]
pub(crate) struct IsInvExpr {
    pub(crate) body: Expr,
    pub(crate) expr: Expr,
}

#[eggplant::relation]
pub(crate) struct IsInvListExpr {
    pub(crate) body: Expr,
    pub(crate) list: ListExpr,
}

#[eggplant::relation]
pub(crate) struct IsInvListExprHelper {
    pub(crate) body: Expr,
    pub(crate) list: ListExpr,
    pub(crate) index: i64,
}

#[eggplant::relation]
pub(crate) struct LsrInv {
    pub(crate) loop_expr: Expr,
    pub(crate) input: Expr,
    pub(crate) output: Expr,
}

#[eggplant::relation]
pub(crate) struct ToSubsumeIf {
    pub(crate) pred: Expr,
    pub(crate) inputs: Expr,
    pub(crate) then_branch: Expr,
    pub(crate) else_branch: Expr,
}

#[eggplant::dsl]
pub(crate) enum Constant {
    #[eggplant::typst("{value}")]
    #[eggplant::precedence(100)]
    Int { value: i64 },
    #[eggplant::typst("{value}")]
    #[eggplant::precedence(100)]
    Bool { value: bool },
    #[eggplant::typst("{value}")]
    #[eggplant::precedence(100)]
    Float { value: f64 },
}

#[eggplant::dsl]
pub(crate) enum TernaryOp {
    #[eggplant::typst("write")]
    #[eggplant::precedence(100)]
    Write {},
    #[eggplant::typst("select")]
    #[eggplant::precedence(100)]
    Select {},
}

#[eggplant::dsl]
pub(crate) enum BinaryOp {
    #[eggplant::typst("&")]
    #[eggplant::precedence(100)]
    Bitand {},
    #[eggplant::typst("+")]
    #[eggplant::precedence(100)]
    Add {},
    #[eggplant::typst("-")]
    #[eggplant::precedence(100)]
    Sub {},
    #[eggplant::typst("/")]
    #[eggplant::precedence(100)]
    Div {},
    #[eggplant::typst("*")]
    #[eggplant::precedence(100)]
    Mul {},
    #[eggplant::typst("<")]
    #[eggplant::precedence(100)]
    LessThan {},
    #[eggplant::typst(">")]
    #[eggplant::precedence(100)]
    GreaterThan {},
    #[eggplant::typst("<=")]
    #[eggplant::precedence(100)]
    LessEq {},
    #[eggplant::typst(">=")]
    #[eggplant::precedence(100)]
    GreaterEq {},
    #[eggplant::typst("=")]
    #[eggplant::precedence(100)]
    Eq {},
    #[eggplant::typst("smin")]
    #[eggplant::precedence(100)]
    Smin {},
    #[eggplant::typst("smax")]
    #[eggplant::precedence(100)]
    Smax {},
    #[eggplant::typst("<<")]
    #[eggplant::precedence(100)]
    Shl {},
    #[eggplant::typst(">>")]
    #[eggplant::precedence(100)]
    Shr {},
    #[eggplant::typst("+")]
    #[eggplant::precedence(100)]
    FAdd {},
    #[eggplant::typst("-")]
    #[eggplant::precedence(100)]
    FSub {},
    #[eggplant::typst("/")]
    #[eggplant::precedence(100)]
    FDiv {},
    #[eggplant::typst("*")]
    #[eggplant::precedence(100)]
    FMul {},
    #[eggplant::typst("<")]
    #[eggplant::precedence(100)]
    FLessThan {},
    #[eggplant::typst(">")]
    #[eggplant::precedence(100)]
    FGreaterThan {},
    #[eggplant::typst("<=")]
    #[eggplant::precedence(100)]
    FLessEq {},
    #[eggplant::typst(">=")]
    #[eggplant::precedence(100)]
    FGreaterEq {},
    #[eggplant::typst("=")]
    #[eggplant::precedence(100)]
    FEq {},
    #[eggplant::typst("fmin")]
    #[eggplant::precedence(100)]
    Fmin {},
    #[eggplant::typst("fmax")]
    #[eggplant::precedence(100)]
    Fmax {},
    #[eggplant::typst("and")]
    #[eggplant::precedence(100)]
    And {},
    #[eggplant::typst("or")]
    #[eggplant::precedence(100)]
    Or {},
    #[eggplant::typst("load")]
    #[eggplant::precedence(100)]
    Load {},
    #[eggplant::typst("+")]
    #[eggplant::precedence(100)]
    PtrAdd {},
    #[eggplant::typst("print")]
    #[eggplant::precedence(100)]
    Print {},
    #[eggplant::typst("free")]
    #[eggplant::precedence(100)]
    Free {},
}

#[eggplant::dsl]
pub(crate) enum UnaryOp {
    #[eggplant::typst("-")]
    #[eggplant::precedence(100)]
    Neg {},
    #[eggplant::typst("abs")]
    #[eggplant::precedence(100)]
    Abs {},
    #[eggplant::typst("!")]
    #[eggplant::precedence(100)]
    Not {},
}

pub(crate) fn expr_section() -> String {
    // `Expr` constructors refer to schema datatypes that used to live in later
    // raw sections, so emit the mutually-referential group together.
    datatypes_section(&[
        "BaseType",
        "TypeList",
        "Type",
        "Assumption",
        "Constant",
        "TernaryOp",
        "BinaryOp",
        "UnaryOp",
        "Expr",
        "ListExpr",
    ])
}

#[allow(dead_code)]
pub(crate) fn types_section() -> String {
    datatypes_section(&["BaseType", "TypeList", "Type"])
}

#[allow(dead_code)]
pub(crate) fn assumptions_section() -> String {
    datatypes_section(&["Assumption"])
}

#[allow(dead_code)]
pub(crate) fn constants_section() -> String {
    datatypes_section(&["Constant"])
}

#[allow(dead_code)]
pub(crate) fn operators_section() -> String {
    datatypes_section(&["TernaryOp", "BinaryOp", "UnaryOp"])
}

pub(crate) fn program_type_section() -> String {
    datatypes_section(&["ProgramType"])
}

pub(crate) fn terms_section() -> String {
    datatypes_section(&["Term", "ListTerm"])
}

fn datatypes_section(datatype_names: &[&str]) -> String {
    use eggplant::egglog::ast::Command;

    let mut datatypes = eggplant::wrap::EgglogTypeRegistry::collect_type_defs()
        .into_iter()
        .find_map(|command| match command {
            Command::Datatypes { datatypes, .. } => Some(datatypes),
            _ => None,
        })
        .unwrap_or_default();

    datatypes.retain(|(_, name, _)| datatype_names.iter().any(|keep| name.as_str() == *keep));
    datatypes.sort_by(|a, b| a.1.cmp(&b.1));

    if datatypes.is_empty() {
        return String::new();
    }

    Command::Datatypes {
        span: eggplant::egglog::span!(),
        datatypes,
    }
    .to_string()
}
